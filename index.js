const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const userSessions = {};
const CHANNEL_USERNAME = 'melodyriverchannel';

// ===== ФУНКЦИЯ: получить или создать пользователя =====
async function getOrCreateUser(telegramId) {
  let { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (!user) {
    const { data: newUser } = await supabase
      .from('users')
      .insert({
        telegram_id: telegramId
      })
      .select()
      .single();

    user = newUser;
  }

  return user;
}

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  const telegramId = msg.from.id;

  await getOrCreateUser(telegramId);

  bot.sendMessage(telegramId, 'Добро пожаловать 🌊', {
    reply_markup: {
      keyboard: [
        ['Получить карточку'],
        ['Моя коллекция', 'Прогресс'],
        ['Карточка за подписку', 'Пригласить друга']
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

    const user = await getOrCreateUser(telegramId);

    // ===== ПОЛУЧИТЬ КАРТОЧКУ =====
    if (text === 'Получить карточку') {

      const today = new Date().toISOString().slice(0, 10);

      // уже получал сегодня
      const { data: existing } = await supabase
        .from('user_cards')
        .select('id')
        .eq('user_id', user.id)
        .eq('date_received', today);

      if (existing && existing.length > 0) {
        return bot.sendMessage(telegramId, 'Ты уже получил карточку сегодня 🌊');
      }

      // полученные карточки
      const { data: userCards } = await supabase
        .from('user_cards')
        .select('card_id')
        .eq('user_id', user.id);

      const ownedIds = userCards?.map(c => c.card_id) || [];

      // все карточки
      const { data: cards } = await supabase
        .from('cards')
        .select('*')
        .eq('active', true);

      if (!cards || cards.length === 0) {
        return bot.sendMessage(telegramId, 'Карточек пока нет');
      }

      // новые карточки
      const availableCards = cards.filter(c => !ownedIds.includes(c.id));

      if (availableCards.length === 0) {
        return bot.sendMessage(telegramId, 'Ты уже собрал все карточки 🌊');
      }

      const card = availableCards[Math.floor(Math.random() * availableCards.length)];

      // сохраняем
      await supabase.from('user_cards').insert({
        user_id: user.id,
        card_id: card.id,
        date_received: today
      });

      // ===== СЕРИЯ =====
      let streak = 1;

      if (user.last_card_date) {
        const diff = Math.floor(
          (new Date(today) - new Date(user.last_card_date)) / (1000 * 60 * 60 * 24)
        );

        streak = diff === 1 ? (user.consecutive_days || 0) + 1 : 1;
      }

      await supabase
        .from('users')
        .update({
          last_card_date: today,
          consecutive_days: streak
        })
        .eq('id', user.id);

      await bot.sendPhoto(telegramId, card.image_url, {
        caption: `${card.text}\n\n🔥 Серия: ${streak}`
      });

      if (availableCards.length <= 5) {
        await bot.sendMessage(telegramId, '🌊 Ты почти собрал всю коллекцию');
      }
    }

    // ===== КОЛЛЕКЦИЯ =====
    if (text === 'Моя коллекция') {

      const { data: userCards } = await supabase
        .from('user_cards')
        .select('card_id')
        .eq('user_id', user.id);

      if (!userCards || userCards.length === 0) {
        return bot.sendMessage(telegramId, 'У тебя пока нет карточек');
      }

      const cardIds = userCards.map(c => c.card_id);

      const { data: cards } = await supabase
        .from('cards')
        .select('*')
        .in('id', cardIds);

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

      userSessions[telegramId] = cards;
    }

    // ===== ПРОГРЕСС =====
    if (text === 'Прогресс') {

      const { data: allCards } = await supabase
        .from('cards')
        .select('id');

      const { data: userCards } = await supabase
        .from('user_cards')
        .select('card_id')
        .eq('user_id', user.id);

      const total = allCards?.length || 0;
      const obtained = userCards?.length || 0;

      const percent = total > 0
        ? Math.round((obtained / total) * 100)
        : 0;

      return bot.sendMessage(
        telegramId,
        `📊 Прогресс:\n${obtained}/${total}\n${percent}%`
      );
    }

    // ===== ПОДПИСКА =====
    if (text === 'Карточка за подписку') {

      if (user.subscription_card_received) {
        return bot.sendMessage(telegramId, 'Ты уже получил эту карточку');
      }

      try {
        const member = await bot.getChatMember(`@${CHANNEL_USERNAME}`, telegramId);

        if (['member', 'administrator', 'creator'].includes(member.status)) {

          const { data: cards } = await supabase
            .from('cards')
            .select('*')
            .eq('special_type', 'subscription');

          if (!cards || cards.length === 0) {
            return bot.sendMessage(telegramId, 'Карточка не найдена');
          }

          const card = cards[0];

          await supabase.from('user_cards').insert({
            user_id: user.id,
            card_id: card.id,
            date_received: new Date().toISOString().slice(0, 10)
          });

          await supabase
            .from('users')
            .update({ subscription_card_received: true })
            .eq('id', user.id);

          return bot.sendPhoto(telegramId, card.image_url, {
            caption: card.text
          });

        } else {
          return bot.sendMessage(
            telegramId,
            `Подпишись:\nhttps://t.me/${CHANNEL_USERNAME}`
          );
        }

      } catch {
        return bot.sendMessage(
          telegramId,
          `Подпишись:\nhttps://t.me/${CHANNEL_USERNAME}`
        );
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

// ===== ЛИСТАНИЕ =====
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
