import { createApp } from 'vue'
import {
  ElButton, ElCheckbox, ElDialog,
  ElIcon, ElInput, ElLoading, ElOption, ElPagination, ElSelect, ElSwitch, ElTable, ElTableColumn, ElTag, ElConfigProvider,
} from 'element-plus'
import 'element-plus/dist/index.css'
import 'virtual:uno.css'
import App from './App.vue'
import './style.css'

const app = createApp(App)
for (const component of [
  ElButton, ElCheckbox, ElDialog,
  ElIcon, ElInput, ElOption, ElPagination, ElSelect, ElSwitch, ElTable, ElTableColumn, ElTag, ElConfigProvider,
]) {
  app.use(component)
}
app.use(ElLoading).mount('#app')
