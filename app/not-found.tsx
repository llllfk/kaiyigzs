import { AppLink } from "@/components/ui/AppLink";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-bold">页面不存在</h1>
      <AppLink href="/" className="btn btn-primary">
        返回首页
      </AppLink>
    </div>
  );
}
