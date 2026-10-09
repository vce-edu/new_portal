import { useEffect, useRef, useState } from "react";
import { X, Plus, Trash2, Pencil, ChevronUp, ChevronDown, Check } from "lucide-react";
import { supabase } from "../createClient";
import Button from "./Button";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";

// real line breaks -> "/n" (what the exam frontend understands)
const toStored = (s) => (s || "").replace(/\r?\n/g, "/n");
// "/n" -> real line breaks (for editing the question and for previewing)
const fromStored = (s) => (s || "").split("/n").join("\n");

const emptyDraft = () => ({
  question_id: null, // set when editing an already-saved question
  pendingIndex: null, // set when editing a question that's staged but not saved yet
  question_text: "",
  marks: 1,
  options: [
    { option_text: "", is_correct: true },
    { option_text: "", is_correct: false },
    { option_text: "", is_correct: false },
    { option_text: "", is_correct: false },
  ],
});

/**
 * Props:
 *  exam      – the exam row ({ exam_id, total_questions, total_score, ... })
 *  readOnly  – true for roles that can view but not edit (e.g. marketing)
 *  onClose   – close handler
 *  onChanged – optional, called after any change so the parent can refresh
 */
export default function ExamQuestionsModal({ exam, readOnly = false, onClose, onChanged }) {
  const [questions, setQuestions] = useState([]); // saved in the database
  const [pending, setPending] = useState([]); // staged, saved together with "Add questions"
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null); // form currently open
  const questionInputRef = useRef(null);

  const draftIsBlank =
    !!draft && !draft.question_text.trim() && draft.options.every((o) => !o.option_text.trim());
  // a half/fully written NEW question sitting in the open form (not editing a saved one)
  const draftHasContent = !!draft && !draft.question_id && !draftIsBlank;
  const saveAllCount = pending.length + (draftHasContent && draft.pendingIndex == null ? 1 : 0);

  function handleClose() {
    const unsaved = pending.length + (draftHasContent && draft.pendingIndex == null ? 1 : 0);
    if (unsaved > 0) {
      const ok = window.confirm(
        `You have ${unsaved} question${unsaved === 1 ? "" : "s"} that haven't been added yet. Close and discard?`
      );
      if (!ok) return;
    }
    onClose();
  }

  // Escape cancels the open form first, then closes the modal
  useCloseOnEscape(() => {
    if (draft) {
      setDraft(null);
      setError("");
    } else {
      handleClose();
    }
  });

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_exam_questions", { p_exam_id: exam.exam_id });
    if (error) {
      setError(error.message || "Couldn't load questions.");
      setQuestions([]);
    } else {
      setError("");
      setQuestions(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [exam.exam_id]);

  const savedMarks = questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
  const pendingMarks = pending.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
  const totalMarks = savedMarks + pendingMarks;
  const totalQuestions = questions.length + pending.length;

  async function run(fn) {
    setBusy(true);
    setError("");
    const { error } = await fn();
    setBusy(false);
    if (error) {
      setError(error.message || "Something went wrong. Please try again.");
      return false;
    }
    await load();
    onChanged?.();
    return true;
  }

  // Validates the open form and returns the cleaned question, or null (and sets an error)
  function validateDraft() {
    const filled = draft.options.filter((o) => o.option_text.trim());
    if (!draft.question_text.trim()) return setError("Write the question first."), null;
    if (filled.length < 2) return setError("Add at least 2 options."), null;
    if (filled.filter((o) => o.is_correct).length !== 1) return setError("Pick the correct option."), null;
    return {
      // Enter presses (real line breaks) are saved as "/n"
      question_text: toStored(draft.question_text.trim()),
      marks: Number(draft.marks) || 0,
      options: filled.map((o) => ({ option_text: o.option_text.trim(), is_correct: !!o.is_correct })),
    };
  }

  // "Add to list" / "Update question" / "Save changes"
  async function handleSubmitDraft() {
    const cleaned = validateDraft();
    if (!cleaned) return;
    setError("");

    // Editing a question that's already saved → save straight away
    if (draft.question_id) {
      const ok = await run(() =>
        supabase.rpc("save_exam_question", {
          p_exam_id: exam.exam_id,
          p_question_id: draft.question_id,
          p_question_text: cleaned.question_text,
          p_marks: cleaned.marks,
          p_options: cleaned.options,
        })
      );
      if (ok) setDraft(null);
      return;
    }

    // Otherwise stage it locally
    const wasEditingStaged = draft.pendingIndex != null;
    setPending((list) =>
      wasEditingStaged ? list.map((q, i) => (i === draft.pendingIndex ? cleaned : q)) : [...list, cleaned]
    );

    if (wasEditingStaged) {
      setDraft(null);
    } else {
      // keep going: open a fresh form straight away, carrying over the marks
      setDraft({ ...emptyDraft(), marks: cleaned.marks });
      setTimeout(() => questionInputRef.current?.focus(), 0);
    }
  }

  // Final "Add questions" → saves every staged question in one go
  async function handleSaveAll() {
    let list = pending;

    // if there's a written question still in the form, include it
    if (draftHasContent) {
      const cleaned = validateDraft();
      if (!cleaned) return;
      list =
        draft.pendingIndex != null
          ? pending.map((q, i) => (i === draft.pendingIndex ? cleaned : q))
          : [...pending, cleaned];
    }
    if (list.length === 0) return;

    const ok = await run(() =>
      supabase.rpc("save_exam_questions_bulk", {
        p_exam_id: exam.exam_id,
        p_questions: list,
      })
    );
    if (ok) {
      setPending([]);
      setDraft(null);
    }
  }

  function handleRemove(q) {
    if (!window.confirm("Remove this question from the exam?")) return;
    run(() => supabase.rpc("remove_exam_question", { p_exam_id: exam.exam_id, p_question_id: q.question_id }));
  }

  function handleMove(q, direction) {
    run(() =>
      supabase.rpc("move_exam_question", {
        p_exam_id: exam.exam_id,
        p_question_id: q.question_id,
        p_direction: direction,
      })
    );
  }

  function updateOption(index, patch) {
    setDraft((d) => ({
      ...d,
      options: d.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    }));
  }

  function setCorrect(index) {
    setDraft((d) => ({
      ...d,
      options: d.options.map((o, i) => ({ ...o, is_correct: i === index })),
    }));
  }

  function removeOption(index) {
    setDraft((d) => {
      const options = d.options.filter((_, i) => i !== index);
      if (!options.some((o) => o.is_correct) && options.length) options[0].is_correct = true;
      return { ...d, options };
    });
  }

  // Enter inside an option field inserts a visible "/n" (Ctrl/⌘ + Enter still submits the form)
  function insertBreak(e, index) {
    if (e.key !== "Enter" || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const el = e.target;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    updateOption(index, { option_text: el.value.slice(0, start) + "/n" + el.value.slice(end) });
    requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
  }

  const countLabel = `${totalQuestions} of ${exam.total_questions} questions`;
  const marksMismatch =
    exam.total_score != null && !loading && totalQuestions > 0 && totalMarks !== exam.total_score;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-3xl rounded-xl border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 className="font-display text-xl text-secondary">Questions</h2>
            <p className="mt-0.5 text-sm text-muted">
              {exam.exam_id} · {countLabel} · {totalMarks} of {exam.total_score} marks
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-muted transition-colors hover:bg-backgroundAlt hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</div>
          )}

          {marksMismatch && !draft && (
            <div className="rounded-md border border-[#F5DDB5] bg-[#FEF3E2] px-3.5 py-2.5 text-sm text-accent">
              Question marks add up to {totalMarks}, but this exam's total score is {exam.total_score}.
            </div>
          )}

          {/* Saved questions */}
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-border/40" />
              ))}
            </div>
          ) : questions.length === 0 && pending.length === 0 && !draft ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
              {readOnly ? "No questions have been added to this exam." : "No questions yet. Use “New question” to start."}
            </div>
          ) : (
            questions.length > 0 && (
              <ol className="space-y-3">
                {questions.map((q, index) => (
                  <QuestionCard
                    key={q.question_id}
                    number={index + 1}
                    question={q}
                    actions={
                      !readOnly && (
                        <>
                          <IconButton label="Move up" disabled={busy || index === 0} onClick={() => handleMove(q, "up")}>
                            <ChevronUp className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            label="Move down"
                            disabled={busy || index === questions.length - 1}
                            onClick={() => handleMove(q, "down")}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            label="Edit question"
                            disabled={busy}
                            onClick={() => {
                              setError("");
                              setDraft({
                                ...emptyDraft(),
                                question_id: q.question_id,
                                question_text: fromStored(q.question_text),
                                marks: q.marks,
                                options: q.options.map((o) => ({
                                  option_text: o.option_text,
                                  is_correct: o.is_correct,
                                })),
                              });
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                          <IconButton label="Remove question" disabled={busy} onClick={() => handleRemove(q)} danger>
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </>
                      )
                    }
                  />
                ))}
              </ol>
            )
          )}

          {/* Staged questions, not saved yet */}
          {!readOnly && pending.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-secondary">
                  Ready to add ({pending.length})
                </h3>
                <span className="text-xs text-muted">Not saved until you click “Add questions”</span>
              </div>
              <ol className="space-y-3">
                {pending.map((q, i) => (
                  <QuestionCard
                    key={i}
                    number={questions.length + i + 1}
                    question={{ ...q, options: q.options.map((o, j) => ({ ...o, option_id: j })) }}
                    staged
                    actions={
                      <>
                        <IconButton
                          label="Edit question"
                          disabled={busy || !!draft}
                          onClick={() => {
                            setError("");
                            setDraft({
                              ...emptyDraft(),
                              pendingIndex: i,
                              question_text: fromStored(q.question_text),
                              marks: q.marks,
                              options: q.options.map((o) => ({ ...o })),
                            });
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          label="Remove from list"
                          disabled={busy}
                          danger
                          onClick={() => setPending((list) => list.filter((_, idx) => idx !== i))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </>
                    }
                  />
                ))}
              </ol>
            </div>
          )}

          {/* Add / edit form */}
          {!readOnly && draft && (
            <div
              className="rounded-lg border border-primary/40 bg-background p-4"
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleSubmitDraft();
                }
              }}
            >
              <h3 className="mb-3 font-display text-base text-secondary">
                {draft.question_id ? "Edit question" : draft.pendingIndex != null ? "Edit unsaved question" : "New question"}
              </h3>

              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="q-text">
                Question
              </label>
              <textarea
                id="q-text"
                rows={3}
                autoFocus
                ref={questionInputRef}
                value={draft.question_text}
                onChange={(e) => setDraft({ ...draft, question_text: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
              />
              <p className="mt-1 text-xs text-muted">Press Enter for a new line (saved as /n).</p>

              <div className="mt-4 mb-1">
                <span className="text-xs font-medium text-muted">Options — select the correct one</span>
              </div>
              <div className="space-y-2">
                {draft.options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct-option"
                      checked={o.is_correct}
                      onChange={() => setCorrect(i)}
                      aria-label={`Option ${i + 1} is correct`}
                      className="h-4 w-4 accent-green-600"
                    />
                    <input
                      type="text"
                      value={o.option_text}
                      onChange={(e) => updateOption(i, { option_text: e.target.value })}
                      onKeyDown={(e) => insertBreak(e, i)}
                      placeholder={`Option ${i + 1}`}
                      className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
                    />
                    <IconButton
                      label="Remove option"
                      danger
                      disabled={draft.options.length <= 2}
                      onClick={() => removeOption(i)}
                    >
                      <X className="h-4 w-4" />
                    </IconButton>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraft((d) => ({ ...d, options: [...d.options, { option_text: "", is_correct: false }] }))
                }
                className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <Plus className="h-4 w-4" /> Add option
              </button>

              <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted" htmlFor="q-marks">
                    Marks
                  </label>
                  <input
                    id="q-marks"
                    type="number"
                    min="0"
                    value={draft.marks}
                    onChange={(e) => setDraft({ ...draft, marks: e.target.value })}
                    className="w-24 rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(null);
                      setError("");
                    }}
                    className="rounded-full px-4 py-2 text-sm text-muted transition-colors hover:text-text"
                  >
                    Cancel
                  </button>
                  <Button onClick={handleSubmitDraft} disabled={busy} title="Ctrl/⌘ + Enter">
                    {busy
                      ? "Saving..."
                      : draft.question_id
                      ? "Save changes"
                      : draft.pendingIndex != null
                      ? "Update question"
                      : "Add to list"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
          {!readOnly ? (
            <button
              type="button"
              disabled={loading || busy || !!draft}
              onClick={() => {
                setError("");
                setDraft(emptyDraft());
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm text-text transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" /> New question
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="rounded-full px-4 py-2 text-sm text-muted transition-colors hover:text-text"
            >
              {pending.length > 0 || draftHasContent ? "Discard & close" : "Done"}
            </button>
            {!readOnly && (
              <Button
                onClick={handleSaveAll}
                disabled={busy || !!draft?.question_id || saveAllCount === 0}
              >
                {busy ? "Adding..." : saveAllCount > 0 ? `Add questions (${saveAllCount})` : "Add questions"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestionCard({ number, question, actions, staged = false }) {
  return (
    <li
      className={`rounded-lg border p-4 ${
        staged ? "border-dashed border-primary/50 bg-background" : "border-border bg-backgroundAlt/40"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-white">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap text-sm font-medium text-text">{fromStored(question.question_text)}</p>
          <ul className="mt-2 space-y-1">
            {question.options.map((o) => (
              <li
                key={o.option_id}
                className={`flex items-center gap-2 text-sm ${o.is_correct ? "font-medium text-green-600" : "text-muted"}`}
              >
                {o.is_correct ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="h-3.5 w-3.5 shrink-0" />}
                <span className="whitespace-pre-wrap">{fromStored(o.option_text)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-xs text-muted">
            {question.marks} mark{Number(question.marks) === 1 ? "" : "s"}
          </span>
          {actions && <div className="flex items-center gap-0.5">{actions}</div>}
        </div>
      </div>
    </li>
  );
}

function IconButton({ label, onClick, disabled, danger, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        danger ? "text-muted hover:bg-red-50 hover:text-red-600" : "text-muted hover:bg-backgroundAlt hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}