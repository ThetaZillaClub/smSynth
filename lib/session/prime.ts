// lib/session/prime.ts
export function primeActiveStudent(studentId: string) {
  if (!studentId) return;

  try { localStorage.setItem("ptp:activeStudentId", studentId); } catch {}

  try {
    const payload = JSON.stringify({ studentId });
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/session/active-student", blob);
    } else {
      fetch("/api/session/active-student", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {}

  // Warm & mirror image_path non-blocking
  try {
    fetch(`/api/students/${encodeURIComponent(studentId)}`, { credentials: "include", keepalive: true })
      .then((r) => (r.ok ? r.json() : null))
      .then((row) => {
        if (row && typeof row.image_path === "string") {
          try { localStorage.setItem("ptp:studentImagePath", row.image_path); } catch {}
        }
      })
      .catch(() => {});
  } catch {}

  try {
    fetch("/api/students/current", { credentials: "include", keepalive: true }).catch(() => {});
  } catch {}
}
