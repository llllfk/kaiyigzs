/** 叠层 Modal/Drawer 共用：引用计数锁 body 滚动，避免关一层把 hidden 写死 */

let lockCount = 0;
let savedOverflow = "";

export function lockBodyScroll() {
  if (typeof document === "undefined") return () => {};
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.style.overflow = savedOverflow;
      savedOverflow = "";
    }
  };
}
