import { Telegraf } from 'telegraf'

const bot = new Telegraf(process.env.BOT_TOKEN)

bot.start(async (ctx) => {
  await ctx.reply(
`Привет. Это Melody River.

Система карточек, которые помогают говорить с близкими глубже, честнее и проще.

Открой мини-приложение, чтобы начать.`
  )
})

bot.launch()
