import { Telegraf } from 'telegraf'

const bot = new Telegraf(process.env.BOT_TOKEN)

// защита от старых клавиатур (очищает reply_markup)
bot.start(async (ctx) => {
  await ctx.reply(
    `Привет. Это Melody River.

Система карточек, которые помогают говорить с близкими глубже, честнее и проще.

Открой мини-приложение, чтобы начать.`,
    {
      reply_markup: { remove_keyboard: true }
    }
  )
})

bot.launch()

console.log('Melody River bot is running...')
