// Loads a PDF blob into a hidden iframe and opens the browser's print dialog.
// An iframe (instead of window.open) avoids popup blockers, since this runs
// after async work (fetching the branch address, building the PDF).
export function printPDF(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";

    const cleanup = () => {
      // keep alive long enough for the print dialog to finish
      setTimeout(() => {
        URL.revokeObjectURL(url);
        iframe.remove();
      }, 60_000);
    };

    iframe.onload = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        cleanup();
        resolve();
      } catch (err) {
        // Fallback: open in a new tab so the user can print from there
        console.error("Inline print failed, opening in a new tab:", err);
        window.open(url, "_blank");
        cleanup();
        resolve();
      }
    };

    iframe.onerror = (e) => {
      URL.revokeObjectURL(url);
      iframe.remove();
      reject(e);
    };

    iframe.src = url;
    document.body.appendChild(iframe);
  });
}