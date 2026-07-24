export default function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-10 px-6">
      <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs text-zinc-600">
          &copy; {new Date().getFullYear()} 凯艺软件开发工作室. All rights
          reserved.
        </p>
        <div className="flex items-center gap-6">
          <span className="text-xs text-zinc-600">
            冀ICP备2026024383号-2
          </span>
        
        </div>
      </div>
    </footer>
  );
}
