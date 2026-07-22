const fs = require("fs");
const p = "G:/凯艺/客户关系管理/components/shared/AppShell.tsx";
let s = fs.readFileSync(p, "utf8");
const old =
  '<header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-[var(--color-border)] bg-white/95 px-4 backdrop-blur">';
const neu = `<header
          className={cn(
            "sticky z-30 flex min-h-14 items-center gap-3 border-b border-[var(--color-border)] bg-white/95 px-4 backdrop-blur",
            acting ? "top-10" : "top-0"
          )}
        >`;
if (!s.includes(old)) {
  console.log("header pattern not found, acting=", s.includes("acting"));
  process.exit(0);
}
s = s.replace(old, neu);
fs.writeFileSync(p, s);
console.log("header updated");
