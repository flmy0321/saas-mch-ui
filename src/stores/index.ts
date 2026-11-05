import { createPinia } from 'pinia'

/** 共享 Pinia 实例：路由守卫/认证回调在组件外也需要访问 store */
export const pinia = createPinia()
