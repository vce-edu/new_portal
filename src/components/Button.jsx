import { forwardRef } from "react";

const VARIANTS = {
  primary:
    "bg-primary text-white hover:bg-primaryDark focus-visible:ring-primary/40 disabled:bg-primary/40",
  secondary:
    "bg-transparent text-primary border border-primary hover:bg-primaryLight focus-visible:ring-primary/30 disabled:border-primary/30 disabled:text-primary/40",
  ghost:
    "bg-transparent text-primary hover:text-primaryDark focus-visible:ring-primary/30 disabled:text-primary/30 px-0",
};

const SIZES = {
  sm: "text-sm px-3.5 py-1.5",
  md: "text-[15px] px-5 py-2.5",
  lg: "text-base px-6 py-3",
};

const Button = forwardRef(function Button(
  {
    children,
    variant = "primary",
    size = "md",
    loading = false,
    disabled = false,
    className = "",
    ...props
  },
  ref
) {
  const isGhost = variant === "ghost";

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        "group relative inline-flex items-center justify-center gap-2 font-medium",
        "rounded-md transition-colors duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed",
        VARIANTS[variant],
        isGhost ? "rounded-none" : SIZES[size],
        isGhost && size === "sm" ? "text-sm py-1" : "",
        isGhost && size === "md" ? "text-[15px] py-1" : "",
        isGhost && size === "lg" ? "text-base py-1.5" : "",
        className,
      ].join(" ")}
      {...props}
    >
      {loading && (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      <span>{children}</span>

      {isGhost && (
        <span
          className="pointer-events-none absolute left-0 -bottom-0.5 h-px w-full origin-left scale-x-0 bg-current transition-transform duration-200 group-hover:scale-x-100"
          aria-hidden="true"
        />
      )}
    </button>
  );
});

export default Button;