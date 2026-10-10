// 启动时注册 ESM loader，使 node --test 能直接 import 源码 .ts 文件
// （源码使用无扩展名相对导入与 @shared/@renderer 路径别名）
import { register } from 'node:module'

register('./ts-loader.mjs', import.meta.url)
