"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";
import {
  Home,
  User,
  Settings,
  Menu,
  ChevronLeft,
  LogOut,
  SquarePen,
  ClipboardList,
  Briefcase,
  MessageSquare,
  GraduationCap,
  Shield,
  FileText,
  Building2,
  X,
} from "lucide-react";

type LinkType = "scroll" | "route";

type NavLink = {
  name: string;
  icon: React.ReactNode;
  type: LinkType;
  target: string;
};

const BRAND = {
  orange: "#F36C21",
  red: "#E02020",
  dark: "#0B1220",
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [query]);

  return matches;
}

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, userData, role, loading, logout } = useAuth();

  const isMobile = useMediaQuery("(max-width: 767px)");

  // Avoid hydration mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Desktop sidebar open/close (persisted)
  const [desktopOpen, setDesktopOpen] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    const saved = localStorage.getItem("sidebarOpen");
    setDesktopOpen(saved === "true");
  }, [mounted]);

  const toggleDesktop = () => {
    const v = !desktopOpen;
    setDesktopOpen(v);
    if (mounted) localStorage.setItem("sidebarOpen", String(v));
  };

  // Mobile drawer state (not persisted)
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    // close drawer on route change
    setDrawerOpen(false);
  }, [pathname]);

  // Links
  const publicLinks: NavLink[] = [
    { name: "Home", icon: <Home size={18} />, type: "scroll", target: "home" },
    {
      name: "Services",
      icon: <Settings size={18} />,
      type: "scroll",
      target: "services",
    },
    {
      name: "About Us",
      icon: <User size={18} />,
      type: "scroll",
      target: "about",
    },
    {
      name: "Login / Sign Up",
      icon: <User size={18} />,
      type: "route",
      target: "/login",
    },
  ];

  const driverLinks: NavLink[] = [
    {
      name: "Dashboard",
      icon: <Home size={18} />,
      type: "route",
      target: "/driver",
    },
    {
      name: "Jobs",
      icon: <Briefcase size={18} />,
      type: "route",
      target: "/jobs",
    },
    {
      name: "Documents",
      icon: <FileText size={18} />,
      type: "route",
      target: "/driver/documents",
    },
    {
      name: "Training",
      icon: <GraduationCap size={18} />,
      type: "route",
      target: "/driver/training",
    },
    {
      name: "Chats",
      icon: <MessageSquare size={18} />,
      type: "route",
      target: "/driver/chats",
    },
  ];

 const businessLinks: NavLink[] = [
   {
     name: "Dashboard",
     icon: <Building2 size={18} />,
     type: "route",
     target: "/business",
   },
   {
     name: "Post Job",
     icon: <SquarePen size={18} />,
     type: "route",
     target: "/business/post-job",
   },
   {
     name: "Posted Jobs",
     icon: <ClipboardList size={18} />,
     type: "route",
     target: "/business/posted-jobs",
   },
   {
     name: "Chats",
     icon: <MessageSquare size={18} />,
     type: "route",
     target: "/business/chats",
   },
 ];

  const adminLinks: NavLink[] = [
    {
      name: "Dashboard",
      icon: <Shield size={18} />,
      type: "route",
      target: "/admin",
    },
    {
      name: "Jobs Posted",
      icon: <Briefcase size={18} />,
      type: "route",
      target: "/admin/jobs-posted",
    },
    {
      name: "Revenue",
      icon: <Settings size={18} />,
      type: "route",
      target: "/admin/revenue",
    },
    {
      name: "Active Users",
      icon: <User size={18} />,
      type: "route",
      target: "/admin/active-users",
    },
    {
      name: "Documents",
      icon: <FileText size={18} />,
      type: "route",
      target: "/admin/documents",
    },
    {
      name: "Training",
      icon: <GraduationCap size={18} />,
      type: "route",
      target: "/admin/training",
    },
  ];

  const links: NavLink[] = useMemo(() => {
    if (!mounted) return publicLinks;
    if (role === "driver") return driverLinks;
    if (role === "business") return businessLinks;
    if (role === "admin") return adminLinks;
    return publicLinks;
  }, [mounted, role]);

  const brandLabel =
    role === "admin"
      ? "Admin"
      : role === "business"
        ? "Business"
        : role === "driver"
          ? "Driver"
          : "EazyWayRides";

  const userLabel =
    user && userData
      ? userData.role === "business"
        ? userData.businessName || user.email
        : userData.name || user.email
      : null;

  const activeCheck = (link: NavLink) => {
    if (link.type !== "route") return false;
    if (link.target === "/") return pathname === "/";
    return pathname === link.target || pathname.startsWith(`${link.target}/`);
  };

  const scrollToSection = (id: string) => {
    if (pathname !== "/") {
      router.push(`/?scroll=${id}`);
      return;
    }
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.offsetTop, behavior: "smooth" });
  };

  const goToRoute = (path: string) => {
    router.push(path);
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="fixed left-0 top-0 z-50 h-14 w-full md:h-screen md:w-16 bg-white border-b md:border-b-0 md:border-r border-gray-200" />
    );
  }

  if (!mounted) {
    return (
      <div className="fixed left-0 top-0 z-50 h-14 w-full md:h-screen md:w-16 bg-white border-b md:border-b-0 md:border-r border-gray-200" />
    );
  }

  /**
   * ✅ MOBILE-FIRST UI:
   * - Top bar (hamburger + title + avatar)
   * - Bottom tab bar
   * - Left drawer (slide over)
   */
  if (isMobile) {
    const mobileTabs =
      role === "driver"
        ? [
            { name: "Home", icon: <Home size={20} />, target: "/driver" },
            { name: "Jobs", icon: <Briefcase size={20} />, target: "/jobs" },
            {
              name: "Docs",
              icon: <FileText size={20} />,
              target: "/driver/documents",
            },
            {
              name: "Chats",
              icon: <MessageSquare size={20} />,
              target: "/driver/chats",
            },
          ]
        : role === "business"
          ? [
              {
                name: "Home",
                icon: <Building2 size={20} />,
                target: "/business",
              },
              {
                name: "Post",
                icon: <SquarePen size={20} />,
                target: "/business/post-job",
              },
              {
                name: "Jobs",
                icon: <ClipboardList size={20} />,
                target: "/business/posted-jobs",
              },
              {
                name: "Chats",
                icon: <MessageSquare size={20} />,
                target: "/business/chats",
              },
            ]
          : role === "admin"
            ? [
                { name: "Home", icon: <Shield size={20} />, target: "/admin" },
                {
                  name: "Jobs",
                  icon: <Briefcase size={20} />,
                  target: "/admin/jobs-posted",
                },
                {
                  name: "Docs",
                  icon: <FileText size={20} />,
                  target: "/admin/documents",
                },
                {
                  name: "Training",
                  icon: <GraduationCap size={20} />,
                  target: "/admin/training",
                },
              ]
            : [{ name: "Home", icon: <Home size={20} />, target: "/" }];

    return (
      <>
        {/* Top App Bar */}
        <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-white border-b border-gray-200">
          <div className="h-full px-3 flex items-center justify-between">
            <button
              onClick={() => setDrawerOpen(true)}
              className="h-10 w-10 grid place-items-center rounded-xl hover:bg-gray-100 active:scale-[0.98] transition"
              aria-label="Open menu">
              <Menu size={20} />
            </button>

            <div className="min-w-0 text-center">
              <div className="text-sm font-semibold text-gray-900 truncate">
                EazyWayRides
              </div>
              <div className="text-[11px] text-gray-500">{brandLabel}</div>
            </div>

            <div className="h-10 w-10 rounded-full bg-gray-100 border border-gray-200 grid place-items-center text-gray-700 font-semibold">
              {user?.email?.[0]?.toUpperCase() || "E"}
            </div>
          </div>
        </header>

        {/* Drawer overlay */}
        {drawerOpen && (
          <div
            className="fixed inset-0 z-[60] bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
        )}

        {/* Drawer */}
        <aside
          className={[
            "fixed top-0 left-0 z-[70] h-full w-80 max-w-[85%]",
            "bg-white border-r border-gray-200 shadow-xl",
            "transition-transform duration-300 ease-out",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}>
          <div className="h-14 px-3 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="h-9 w-9 rounded-xl text-white grid place-items-center"
                style={{ backgroundColor: BRAND.orange }}>
                <Home size={18} />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-gray-900">
                  EazyWayRides
                </div>
                <div className="text-[11px] text-gray-500">{brandLabel}</div>
              </div>
            </div>

            <button
              onClick={() => setDrawerOpen(false)}
              className="h-10 w-10 grid place-items-center rounded-xl hover:bg-gray-100 transition"
              aria-label="Close menu">
              <X size={18} />
            </button>
          </div>

          <nav className="p-3 space-y-1">
            {links.map((link) => {
              const active = activeCheck(link);
              return (
                <button
                  key={link.name}
                  onClick={() => {
                    if (link.type === "scroll") scrollToSection(link.target);
                    else goToRoute(link.target);
                    setDrawerOpen(false);
                  }}
                  className={[
                    "w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition",
                    active
                      ? "bg-orange-50 text-gray-900 border border-orange-100"
                      : "hover:bg-gray-50 text-gray-800",
                  ].join(" ")}>
                  <span
                    className="h-10 w-10 rounded-xl grid place-items-center border"
                    style={{
                      borderColor: active ? "#FED7AA" : "#E5E7EB",
                      background: active ? "#FFF7ED" : "white",
                      color: active ? BRAND.orange : "#111827",
                    }}>
                    {link.icon}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {link.name}
                    </div>
                    {active && (
                      <div className="text-[11px] text-gray-500">
                        You’re here
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-gray-200 bg-white">
            {userLabel && (
              <div className="mb-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-[11px] text-gray-500">Signed in as</div>
                <div className="text-sm font-semibold text-gray-900 truncate">
                  {userLabel}
                </div>
              </div>
            )}

            {user ? (
              <button
                onClick={logout}
                className="w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-red-50 transition">
                <span className="h-10 w-10 rounded-xl grid place-items-center bg-red-50 text-red-600 border border-red-100">
                  <LogOut size={18} />
                </span>
                <span className="text-sm font-semibold text-red-600">
                  Log Out
                </span>
              </button>
            ) : (
              <button
                onClick={() => goToRoute("/login")}
                className="w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-gray-50 transition">
                <span className="h-10 w-10 rounded-xl grid place-items-center bg-gray-50 text-gray-800 border border-gray-200">
                  <User size={18} />
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  Login
                </span>
              </button>
            )}
          </div>
        </aside>

        {/* Bottom Tab Bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200">
          <div className="grid grid-cols-4">
            {mobileTabs.map((t) => {
              const active =
                pathname === t.target || pathname.startsWith(`${t.target}/`);
              return (
                <button
                  key={t.name}
                  onClick={() => router.push(t.target)}
                  className="py-2.5 flex flex-col items-center justify-center gap-1 active:scale-[0.99] transition">
                  <span
                    className={[
                      "h-10 w-10 rounded-2xl grid place-items-center border transition",
                      active
                        ? "bg-orange-50 border-orange-100"
                        : "bg-white border-transparent",
                    ].join(" ")}
                    style={{ color: active ? BRAND.orange : "#111827" }}>
                    {t.icon}
                  </span>
                  <span
                    className={[
                      "text-[11px] font-medium",
                      active ? "text-gray-900" : "text-gray-500",
                    ].join(" ")}>
                    {t.name}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </>
    );
  }

  /**
   * ✅ DESKTOP UI:
   * Collapsible left sidebar (persisted)
   */
  return (
    <aside
      className={[
        "fixed left-0 top-0 z-50 h-screen",
        "bg-white border-r border-gray-200",
        "transition-all duration-300 ease-out",
        desktopOpen ? "w-72" : "w-16",
      ].join(" ")}
      aria-label="Sidebar">
      {/* Header */}
      <div className="h-16 px-2 flex items-center gap-2 border-b border-gray-200">
        <button
          onClick={toggleDesktop}
          className="h-10 w-10 grid place-items-center rounded-xl hover:bg-gray-100 transition"
          aria-label={desktopOpen ? "Collapse sidebar" : "Expand sidebar"}>
          {desktopOpen ? <ChevronLeft size={18} /> : <Menu size={18} />}
        </button>

        {desktopOpen && (
          <div className="flex items-center gap-2">
            <div
              className="h-9 w-9 rounded-xl text-white grid place-items-center"
              style={{ backgroundColor: BRAND.orange }}>
              <Home size={18} />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">
                EazyWayRides
              </div>
              <div className="text-[11px] text-gray-500">{brandLabel}</div>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="p-2 mt-2 space-y-1">
        {links.map((link) => {
          const active = activeCheck(link);

          return (
            <button
              key={link.name}
              onClick={() => {
                if (link.type === "scroll") scrollToSection(link.target);
                else goToRoute(link.target);
              }}
              className={[
                "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 transition text-left",
                active
                  ? "bg-orange-50 text-gray-900 border border-orange-100"
                  : "text-gray-800 hover:bg-gray-50",
              ].join(" ")}>
              <span
                className="h-9 w-9 grid place-items-center rounded-xl border"
                style={{
                  borderColor: active ? "#FED7AA" : "#E5E7EB",
                  background: active ? "#FFF7ED" : "white",
                  color: active ? BRAND.orange : "#111827",
                }}>
                {link.icon}
              </span>

              {desktopOpen && (
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {link.name}
                  </div>
                  {active && (
                    <div className="text-[11px] text-gray-500 truncate">
                      You’re here
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 w-full border-t border-gray-200 p-3 bg-white">
        {userLabel && desktopOpen && (
          <div className="mb-2 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">
            <div className="text-[11px] text-gray-500">Signed in as</div>
            <div className="text-sm font-semibold text-gray-900 truncate">
              {userLabel}
            </div>
          </div>
        )}

        {user ? (
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-red-50 transition">
            <span className="h-9 w-9 grid place-items-center rounded-xl bg-red-50 text-red-600 border border-red-100">
              <LogOut size={18} />
            </span>
            {desktopOpen && (
              <span className="text-sm font-semibold text-red-600">
                Log Out
              </span>
            )}
          </button>
        ) : (
          <button
            onClick={() => goToRoute("/login")}
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-gray-50 transition">
            <span className="h-9 w-9 grid place-items-center rounded-xl bg-gray-50 text-gray-800 border border-gray-200">
              <User size={18} />
            </span>
            {desktopOpen && (
              <span className="text-sm font-semibold text-gray-900">Login</span>
            )}
          </button>
        )}
      </div>
    </aside>
  );
}
