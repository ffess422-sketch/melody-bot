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
        ['Пригласить друга'],
        ['Прогресс']
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

  const { data: userData } = await supabase
  .from('users')
  .select('last_card_date, consecutive_days')
  .eq('telegram_id', telegramId)
  .single();

let streak = 1;

if (userData?.last_card_date) {
  const last = new Date(userData.last_card_date);
  const now = new Date(today);

  const diff = Math.floor((now - last) / (1000 * 60 * 60 * 24));

  if (diff === 1) {
    streak = (userData.consecutive_days || 0) + 1;
  } else if (diff === 0) {
    streak = userData.consecutive_days || 1;
  } else {
    streak = 1;
  }
  if (streak === 5 || streak === 10 || streak === 15) {

  const { data: bonusCards } = await supabase
    .from('cards')
    .select('*')
    .eq('special_type', 'streak')
    .eq('active', true);

  if (bonusCards && bonusCards.length > 0) {

    const bonus = bonusCards[Math.floor(Math.random() * bonusCards.length)];

    await supabase.from('user_cards').insert({
      user_id: telegramId,
      card_id: bonus.id,
      date_received: today
    });

    await bot.sendMessage(
      telegramId,
      `🏆 Серия ${streak} дней — ты держишь ритм`
    );

    await bot.sendPhoto(telegramId, bonus.image_url, {
      caption: bonus.text
    });
  }
}
}
  // 1. проверка — уже получал сегодня
  const { data: existing } = await supabase
    .from('user_cards')
    .select('id')
    .eq('user_id', telegramId)
    .eq('date_received', today);

  if (existing && existing.length > 0) {
    return bot.sendMessage(telegramId, 'Ты уже получил карточку сегодня 🌊');
  }

  // 2. получаем уже полученные карточки
  const { data: userCards } = await supabase
    .from('user_cards')
    .select('card_id')
    .eq('user_id', telegramId);

  const ownedIds = userCards?.map(c => c.card_id) || [];

  // 3. получаем все активные карточки
  const { data: cards } = await supabase
    .from('cards')
    .select('*')
    .eq('active', true);

  if (!cards || cards.length === 0) {
    return bot.sendMessage(telegramId, 'Карточек пока нет');
  }

  // 4. фильтруем новые
  const availableCards = cards.filter(c => !ownedIds.includes(c.id));

  // 5. если всё собрано
  if (availableCards.length === 0) {
    return bot.sendMessage(telegramId, 'Ты собрал все карточки 🌊');
  }

  // 6. выбираем случайную
  const card = availableCards[Math.floor(Math.random() * availableCards.length)];

  // 7. сохраняем
  await supabase.from('user_cards').insert({
   await supabase
  .from('users')
  .update({
    last_card_date: today,
    consecutive_days: streak
  })
  .eq('telegram_id', telegramId);

  // 8. отправляем карточку
  await bot.sendPhoto(telegramId, card.image_url, {
    caption: `${card.text}\n\n🔥 Серия: ${streak} дней`
  });

  // ===== ШАГ 3 (UX) =====
  if (availableCards.length <= 5) {
    await bot.sendMessage(
      telegramId,
      '🌊 Ты почти собрал всю коллекцию'
    );
  }
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

bot.on('message', async (msg) => {
  const telegramId = msg.from.id;
  const text = msg.text;

  if (text !== 'Прогресс') return;

  const { data: allCards } = await supabase
    .from('cards')
    .select('id');

  const { data: userCards } = await supabase
    .from('user_cards')
    .select('card_id')
    .eq('user_id', telegramId);

  const total = allCards?.length || 0;
  const obtained = userCards?.length || 0;

  const percent = total > 0
    ? Math.round((obtained / total) * 100)
    : 0;

  let status = '🌱 Новичок';

  if (percent >= 25) status = '🌊 Исследователь';
  if (percent >= 50) status = '🏡 Житель Melody River';
  if (percent >= 75) status = '🧭 Хранитель коллекции';
  if (percent >= 100) status = '🌟 Мастер тишины';

  return bot.sendMessage(
    telegramId,
    `📊 Твой путь в Melody River:\n\n` +
    `Карточки: ${obtained} / ${total}\n` +
    `Прогресс: ${percent}%\n\n` +
    `Статус: ${status}`
  );
});
