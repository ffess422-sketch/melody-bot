const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);
const userSessions = {};

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

  const today = new Date().toISOString().slice(0, 10);

  // проверка — получал ли сегодня
  const { data: existing } = await supabase
    .from('user_cards')
    .select('date_received')
    .eq('user_id', telegramId)
    .eq('date_received', today);

  if (existing && existing.length > 0) {
    return bot.sendMessage(telegramId, 'Ты уже получил карточку сегодня');
  }

  // какие карточки уже есть у пользователя
  const { data: userCards } = await supabase
    .from('user_cards')
    .select('card_id')
    .eq('user_id', telegramId);

  const ownedIds = userCards.map(c => c.card_id);

  // берём только НОВЫЕ карточки
  let query = supabase.from('cards').select('*');

  if (ownedIds.length > 0) {
    query = query.not('id', 'in', `(${ownedIds.join(',')})`);
  }

  const { data: availableCards } = await query;

  // если все карточки получены
  if (!availableCards || availableCards.length === 0) {
    return bot.sendMessage(telegramId, 'Ты уже собрал все карточки 🌊');
  }

  const card = availableCards[Math.floor(Math.random() * availableCards.length)];

  await supabase.from('user_cards').insert({
    user_id: telegramId,
    card_id: card.id,
    date_received: today
  });

  bot.sendPhoto(telegramId, card.image_url, {
    caption: card.text
  });
}

    // ===== КОЛЛЕКЦИЯ =====
  if (text === 'Моя коллекция') {

  const { data: userCards } = await supabase
    .from('user_cards')
    .select('card_id')
    .eq('user_id', telegramId);

  if (!userCards || userCards.length === 0) {
    return bot.sendMessage(telegramId, 'У тебя пока нет карточек');
  }

  const cardIds = userCards.map(c => c.card_id);

  const { data: cards } = await supabase
    .from('cards')
    .select('*')
    .in('id', cardIds);

  if (!cards || cards.length === 0) {
    return bot.sendMessage(telegramId, 'Ошибка загрузки карточек');
  }

  // отправляем первую карточку
  const card = cards[0];

  bot.sendPhoto(telegramId, card.image_url, {
    caption: card.text,
    reply_markup: {
      inline_keyboard: [[
        { text: '⬅️', callback_data: `prev_0` },
        { text: '➡️', callback_data: `next_0` }
      ]]
    }
  });

  // сохраняем карточки в памяти
  userSessions[telegramId] = cards;
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

bot.on('callback_query', async (query) => {
  const telegramId = query.from.id;
  const data = query.data;

  const cards = userSessions[telegramId];
  if (!cards) return;

  let index = Number(data.split('_')[1]);

  if (data.startsWith('next')) {
    index = (index + 1) % cards.length;
  } else {
    index = (index - 1 + cards.length) % cards.length;
  }

  const card = cards[index];

  bot.editMessageMedia(
    {
      type: 'photo',
      media: card.image_url,
      caption: card.text
    },
    {
      chat_id: telegramId,
      message_id: query.message.message_id,
      reply_markup: {
        inline_keyboard: [[
          { text: '⬅️', callback_data: `prev_${index}` },
          { text: '➡️', callback_data: `next_${index}` }
        ]]
      }
    }
  );
});
