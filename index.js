const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  const telegramId = msg.from.id;

  bot.sendMessage(telegramId, 'Добро пожаловать 🌊', {
    reply_markup: {
      keyboard: [
        ['Получить карточку'],
        ['Моя коллекция'],
        ['Пригласить друга']
      ],
      resize_keyboard: true
    }
  });
});

// ===== ОСНОВНАЯ ЛОГИКА =====
bot.on('message', async (msg) => {
  try {
    const telegramId = msg.from.id;
    const text = msg.text;

    if (!text) return;

    console.log('НАЖАТО:', text);

    // ===== ПОЛУЧИТЬ КАРТОЧКУ =====
    if (text === 'Получить карточку') {

      const { data: cards, error } = await supabase
        .from('cards')
        .select('*');

      if (error) {
        console.error(error);
        return bot.sendMessage(telegramId, 'Ошибка загрузки карточек');
      }

      if (!cards || cards.length === 0) {
        return bot.sendMessage(telegramId, 'Карточек пока нет');
      }

      const card = cards[Math.floor(Math.random() * cards.length)];

      await supabase.from('user_cards').insert({
        user_id: telegramId,
        card_id: card.id
      });

      return bot.sendPhoto(telegramId, card.image_url, {
        caption: card.text
      });
    }

    // ===== КОЛЛЕКЦИЯ =====
    if (text === 'Моя коллекция') {

      const { data: userCards, error } = await supabase
        .from('user_cards')
        .select(`
          card_id,
          cards (
            text,
            image_url
          )
        `)
        .eq('user_id', telegramId);

      if (error) {
        console.error(error);
        return bot.sendMessage(telegramId, 'Ошибка загрузки коллекции');
      }

      if (!userCards || userCards.length === 0) {
        return bot.sendMessage(telegramId, 'У тебя пока нет карточек');
      }

      for (const uc of userCards) {
        if (!uc.cards) continue;

        await bot.sendPhoto(telegramId, uc.cards.image_url, {
          caption: uc.cards.text
        });
      }
    }

    // ===== РЕФЕРАЛКА =====
    if (text === 'Пригласить друга') {
      const link = `https://t.me/${process.env.BOT_USERNAME}?start=ref_${telegramId}`;
      return bot.sendMessage(telegramId, link);
    }

  } catch (err) {
    console.error('ОШИБКА:', err);
  }
});
