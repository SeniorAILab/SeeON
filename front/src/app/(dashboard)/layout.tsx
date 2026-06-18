import type { ReactNode } from "react";
import { AppNav } from "../../components/AppNav";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      <AppNav />
      <main className="flex-1">{children}</main>
    </div>
  );
}
