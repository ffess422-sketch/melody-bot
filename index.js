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

  // 1. Получаем записи пользователя
  const { data: userCards, error } = await supabase
    .from('user_cards')
    .select('card_id')
    .eq('user_id', telegramId);

  if (error) {
    console.error(error);
    return bot.sendMessage(telegramId, 'Ошибка загрузки коллекции (user_cards)');
  }

  if (!userCards || userCards.length === 0) {
    return bot.sendMessage(telegramId, 'У тебя пока нет карточек');
  }

  // 2. Получаем сами карточки
  const cardIds = userCards.map(uc => uc.card_id);

  const { data: cards, error: cardsError } = await supabase
    .from('cards')
    .select('*')
    .in('id', cardIds);

  if (cardsError) {
    console.error(cardsError);
    return bot.sendMessage(telegramId, 'Ошибка загрузки карточек');
  }

  // 3. Показываем карточки
  for (const card of cards) {
    await bot.sendPhoto(telegramId, card.image_url, {
      caption: card.text
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
