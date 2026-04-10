const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const dayjs = require('dayjs');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ===== /start =====
bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
  const telegramId = msg.from.id;
  const ref = match[1];

  // Проверяем пользователя по telegram_id
  let { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (!user) {
    const { data: newUser } = await supabase
      .from('users')
      .insert({
        telegram_id: telegramId,
        invited_by: ref ? Number(ref.replace('ref_', '')) : null
      })
      .select()
      .single();

    user = newUser;
  }

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
  const telegramId = msg.from.id;
  const text = msg.text;

  // Получаем user из базы
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (!user) return;

  const userId = user.id;

  // ===== ПОЛУЧИТЬ КАРТОЧКУ =====
  if (text === 'Получить карточку') {
    const today = dayjs().format('YYYY-MM-DD');

    if (user.last_card_date === today) {
      return bot.sendMessage(telegramId, 'Ты уже получил карточку сегодня');
    }

    // Получаем случайную карточку
    const { data: cards } = await supabase
      .from('cards')
      .select('*')
      .eq('active', true);

    const card = cards[Math.floor(Math.random() * cards.length)];

    // Сохраняем
    await supabase.from('user_cards').insert({
      user_id: userId,
      card_id: card.id,
      date_received: today,
      special: card.special_type ? true : false
    });

    // ===== СЕРИЯ ДНЕЙ =====
    let streak = 1;

    if (user.last_card_date) {
      const diff = dayjs(today).diff(dayjs(user.last_card_date), 'day');
      streak = diff === 1 ? (user.consecutive_days || 0) + 1 : 1;
    }

    await supabase
      .from('users')
      .update({
        last_card_date: today,
        consecutive_days: streak
      })
      .eq('id', userId);

    bot.sendPhoto(telegramId, card.image_url, {
      caption: `🌊 Карточка дня\n\n${card.text}\n\n🔥 Серия: ${streak}`
    });
  }

  // ===== КАТАЛОГ =====
  if (text === 'Моя коллекция') {
    const { data: userCards, error } = await supabase
      .from('user_cards')
      .select(`
        card_id,
        date_received,
        view_count,
        cards (
          id,
          text,
          image_url,
          rarity,
          special_type
        )
      `)
      .eq('user_id', userId)
      .order('date_received', { ascending: true });

    if (error) {
      console.error(error);
      return bot.sendMessage(telegramId, 'Ошибка при получении карточек');
    }

    if (!userCards || userCards.length === 0) {
      return bot.sendMessage(telegramId, 'У тебя пока нет карточек');
    }

    // Отправляем карточки КАРТИНКАМИ
    for (const uc of userCards) {
      const card = uc.cards;

      let caption = `${card.text}`;

      if (card.rarity !== 'обычная') caption += ' ✨';
      if (card.special_type) caption += ' 🏆';

      await bot.sendPhoto(telegramId, card.image_url, {
        caption
      });

      // увеличиваем просмотр
      await supabase
        .from('user_cards')
        .update({ view_count: (uc.view_count || 0) + 1 })
        .eq('user_id', userId)
        .eq('card_id', uc.card_id);
    }

    bot.sendMessage(telegramId, `Всего карточек: ${userCards.length}`);
  }

  // ===== РЕФЕРАЛКА =====
  if (text === 'Пригласить друга') {
    const link = `https://t.me/${process.env.BOT_USERNAME}?start=ref_${telegramId}`;
    bot.sendMessage(telegramId, link);
  }
});
