import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      component: () => import("@/views/CryptView.vue"),
      props: route => ({
        action: route.query.action,
        keyContent: route.query["key.content"] || route.query.key,
        keyEncoding: route.query["key.encoding"] || route.query.key_encoding || route.query.keyEncoding,
        input: route.query.input,
      }),
    },
    {
      path: "/key",
      component: () => import("@/views/KeyView.vue"),
    },
  ],
})

export default router
