// import axios from "axios"
import Koa from "koa"
import cors from "koa-cors"
import koaBody from "koa-body"
import koaStatic from "koa-static"
import LruCache from "lru-cache"
import { mock } from "mockjs"
import parseSwagger, { ParsedSwagger, Swagger } from "./parse-swagger"
import swaggerJSon from "./swagger.json"
import toMockTemplate from "./to-mock-template"
const app = new Koa()

function sleep(timeout: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, timeout)
  })
}

const lruCache = new LruCache<string, ParsedSwagger>({
  max: 1024 * 4,
})

lruCache.set("swagger", parseSwagger(swaggerJSon as Swagger))

app.use(cors())
app.use(koaBody())

// 获取swagger配置
app.use(async (ctx, next) => {
  // const { data } = await axios.get<Swagger>(ctx.query.url as string)
  if (ctx.headers["x-use-mock"]) {
    return await next()
  }
  if (ctx.path === "/swagger") {
    ctx.body = JSON.stringify(lruCache.get("swagger"))
  } else if (ctx.path === "/mockConfig" && ctx.method === "POST") {
    const {
      request: { body },
    } = ctx
    lruCache.set((body.url as string) + body.method + body.type, body.config)
    ctx.body = 0
  } else if (ctx.path === "/mockConfig" && ctx.method === "GET") {
    const { query } = ctx
    const cacheResult = lruCache.get((query.url as string) + query.method + query.type)
    if (cacheResult) {
      ctx.body = cacheResult
    }
  }
})

// mock接口
app.use(async (ctx, next) => {
  if (!ctx.headers["x-use-mock"]) {
    return await next()
  }
  const cacheMockJSON = lruCache.get(ctx.path + ctx.method.toLocaleLowerCase() + 1)
  if (cacheMockJSON) {
    await sleep(Number(ctx.headers["x-mock-timeout"]) || 0)
    ctx.body = cacheMockJSON
    return
  }
  const cache = lruCache.get("swagger")
  const responseBody = cache?.paths[ctx.path]?.[ctx.method.toLocaleLowerCase()]?.responseBody
  if (!responseBody) {
    return await next()
  }
  await sleep(Number(ctx.headers["x-mock-timeout"]) || 0)
  ctx.body = mock(toMockTemplate(responseBody))
})

app.use(koaStatic(`${__dirname}/static`))

app.listen("7788", () => {
  console.log(`server running at: http://localhost:${7788}`)
})
