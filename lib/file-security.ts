import path from "node:path";
import { AuthError } from "@/lib/auth";
const DANGEROUS_EXTS=new Set(["exe","dll","com","bat","cmd","ps1","sh","js","mjs","cjs","html","htm","svg","php","jsp","jar","msi","scr"]);
const DANGEROUS_MIMES=["text/html","image/svg+xml","application/javascript","text/javascript","application/x-msdownload"];
export function assertSafeUpload(file:{name:string;type?:string|null},buf:Buffer,options?:{allowedExts?:string[];maxBytes?:number}) {
  const name=String(file.name||"").trim();
  if(!name || name.length>200 || /[\0\r\n]/.test(name)) throw new AuthError("文件名无效",400);
  if(options?.maxBytes && buf.length>options.maxBytes) throw new AuthError(`文件不能超过 ${Math.ceil(options.maxBytes/1024/1024)}MB`,400);
  const ext=path.extname(name).slice(1).toLowerCase(); const mime=String(file.type||"").toLowerCase().split(";")[0];
  if(!ext || DANGEROUS_EXTS.has(ext) || DANGEROUS_MIMES.includes(mime)) throw new AuthError("不支持该文件类型",400);
  if(options?.allowedExts && !options.allowedExts.includes(ext)) throw new AuthError("文件类型不在允许范围内",400);
  const head=buf.subarray(0,512).toString("utf8").trimStart().toLowerCase();
  if(head.startsWith("<html")||head.startsWith("<!doctype html")||head.startsWith("<svg")||buf.subarray(0,2).toString("hex")==="4d5a") throw new AuthError("检测到危险或伪装文件",400);
}
