import { createRouter, createWebHashHistory } from "vue-router";
import ClientView from "./views/ClientView.vue";
import HostView from "./views/HostView.vue";

const routes = [
  {
    path: "/",
    name: "client",
    component: ClientView,
    beforeEnter: (to: any) => {
      // If token is in query string, forward to host dashboard
      if (to.query.token) {
        return { path: "/host", query: to.query };
      }
    },
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
  history: createWebHashHistory(),
  routes,
});
