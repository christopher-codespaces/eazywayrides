"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

const HIDE_SIDEBAR_ON = ["/", "/login", "/complete-signup"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const hideSidebar =
    HIDE_SIDEBAR_ON.includes(pathname) ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next");

  return (
    <>
      {!hideSidebar && <Sidebar />}
      <main
        className={
          !hideSidebar ? "ml-0 md:ml-16 transition-all duration-300" : ""
        }>
        {children}
      </main>
    </>
  );
}
