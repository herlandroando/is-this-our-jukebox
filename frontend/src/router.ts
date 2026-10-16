import { createRouter, createWebHistory } from "vue-router";
import ClientView from "./views/ClientView.vue";
import HostView from "./views/HostView.vue";

const routes = [
  {
    path: "/",
    name: "client",
    component: ClientView,
  },
  {
    path: "/host",
    name: "host",
    component: HostView,
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/",
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  // 1. Handle legacy or server-generated hash-based URLs (e.g. /#/host?token=..., /#/?token=..., #/host)
  if (typeof window !== "undefined" && window.location.hash) {
    const rawHash = window.location.hash.slice(1);
    const [hashPath, hashSearch] = rawHash.split("?");
    const hashParams = new URLSearchParams(hashSearch || (hashPath.includes("=") ? hashPath : ""));
    const hashToken = hashParams.get("token");
    const isHost = hashPath.includes("host");

    if (isHost || hashToken) {
      const mergedQuery: Record<string, any> = { ...to.query };
      if (hashToken) {
        mergedQuery.token = hashToken;
        try {
          localStorage.setItem("jukebox_admin_token", hashToken);
        } catch {
          // ignore storage error
        }
      }
      try {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      } catch {
        // ignore
      }
      return { path: "/host", query: mergedQuery };
    }
  }

  // 2. If token is in query string on root path (/), forward to host dashboard
  if (to.path === "/" && to.query.token) {
    if (typeof to.query.token === "string") {
      try {
        localStorage.setItem("jukebox_admin_token", to.query.token);
      } catch {
        // ignore
      }
    }
    return { path: "/host", query: to.query };
  }

  // 3. Handle /host token persistence and restoration
  if (to.path === "/host") {
    if (to.query.token && typeof to.query.token === "string") {
      try {
        localStorage.setItem("jukebox_admin_token", to.query.token);
      } catch {
        // ignore
      }
    } else {
      try {
        const savedToken = localStorage.getItem("jukebox_admin_token");
        if (savedToken) {
          return { path: "/host", query: { ...to.query, token: savedToken } };
        }
      } catch {
        // ignore
      }
    }
  }
});

