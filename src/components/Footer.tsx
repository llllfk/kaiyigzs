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
            ICP备xxxxxxxx号
          </span>
          {/* Social icon placeholders */}
          <div className="flex items-center gap-3">
            {['GitHub', 'WeChat', 'Email'].map((name) => (
              <span
                key={name}
                className="w-8 h-8 rounded-full border border-white/[0.06] flex items-center justify-center text-zinc-600 hover:text-zinc-400 hover:border-white/[0.12] transition-colors cursor-pointer text-[10px]"
              >
                {name[0]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
