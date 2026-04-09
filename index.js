const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const dayjs = require('dayjs');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
  const userId = msg.from.id;
  const ref = match[1];

  let { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (!user) {
    await supabase.from('users').insert({
      id: userId,
      invited_by: ref ? Number(ref.replace('ref_', '')) : null
    });
  }

  bot.sendMessage(userId, 'Добро пожаловать 🌊', {
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

bot.on('message', async (msg) => {
  const userId = msg.from.id;
  const text = msg.text;

  if (text === 'Получить карточку') {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    const today = dayjs().format('YYYY-MM-DD');

    if (user.last_card_date === today) {
      return bot.sendMessage(userId, 'Ты уже получил карточку сегодня');
    }

    const { data: cards } = await supabase.from('cards').select('*');
    const card = cards[Math.floor(Math.random() * cards.length)];

    await supabase.from('user_cards').insert({
      user_id: userId,
      card_id: card.id
    });

    let streak = 1;
    if (user.last_card_date) {
      const diff = dayjs(today).diff(dayjs(user.last_card_date), 'day');
      streak = diff === 1 ? user.streak_days + 1 : 1;
    }

    await supabase.from('users').update({
      last_card_date: today,
      streak_days: streak
    }).eq('id', userId);

    bot.sendPhoto(userId, card.image_url, {
      caption: `🌊 Карточка дня\n\n${card.text}\n\n🔥 Серия: ${streak}`
    });
  }

  if (text === 'Моя коллекция') {
    const { data: cards } = await supabase
      .from('user_cards')
      .select('card_id')
      .eq('user_id', userId);

    bot.sendMessage(userId, `У тебя ${cards.length} карточек`);
  }

  if (text === 'Пригласить друга') {
    const link = `https://t.me/${process.env.BOT_USERNAME}?start=ref_${userId}`;
    bot.sendMessage(userId, link);
  }
});
