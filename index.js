const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const userSessions = {};
const CHANNEL_USERNAME = 'melodyriverchannel';

// ===== USER =====
async function getOrCreateUser(telegramId) {
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId);

  if (error) {
    console.error('Ошибка поиска user:', error);
    return null;
  }

  if (users && users.length > 0) {
    return users[0];
  }

  const { data: newUsers, error: insertError } = await supabase
    .from('users')
    .insert({ telegram_id: telegramId })
    .select();

  if (insertError) {
    console.error('Ошибка создания user:', insertError);
    return null;
  }

  return newUsers[0];
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

// ===== MESSAGE =====
bot.on('message', async (msg) => {
  const telegramId = msg.from.id;
  const text = msg.text;

  if (!text) return;

  console.log('НАЖАТО:', text);

  const user = await getOrCreateUser(telegramId);

  if (!user) {
    return bot.sendMessage(telegramId, 'Ошибка пользователя. Напиши /start');
  }

  try {

    // ===== ПОЛУЧИТЬ КАРТОЧКУ =====
    if (text === 'Получить карточку') {

      const today = new Date().toISOString().slice(0, 10);

      const { data: existing } = await supabase
        .from('user_cards')
        .select('id')
        .eq('user_id', user.id)
        .eq('date_received', today);

      if (existing && existing.length > 0) {
        return bot.sendMessage(telegramId, 'Ты уже получил карточку сегодня 🌊');
      }

      const { data: userCards } = await supabase
        .from('user_cards')
        .select('card_id')
        .eq('user_id', user.id);

      const ownedIds = userCards?.map(c => c.card_id) || [];

      const { data: cards } = await supabase
        .from('cards')
        .select('*')
        .eq('active', true);

      if (!cards || cards.length === 0) {
        return bot.sendMessage(telegramId, 'Карточек пока нет');
      }

      const availableCards = cards.filter(c => !ownedIds.includes(c.id));

      if (availableCards.length === 0) {
        return bot.sendMessage(telegramId, 'Ты уже собрал все карточки 🌊');
      }

      const card = availableCards[Math.floor(Math.random() * availableCards.length)];

      await supabase.from('user_cards').insert({
        user_id: user.id,
        card_id: card.id,
        date_received: today
      });

      return bot.sendPhoto(telegramId, card.image_url, {
        caption: card.text
      });
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

      const ids = userCards.map(c => c.card_id);

      const { data: cards } = await supabase
        .from('cards')
        .select('*')
        .in('id', ids);

      const card = cards[0];

      userSessions[telegramId] = cards;

      return bot.sendPhoto(telegramId, card.image_url, {
        caption: card.text,
        reply_markup: {
          inline_keyboard: [[
            { text: '⬅️', callback_data: 'prev_0' },
            { text: '➡️', callback_data: 'next_0' }
          ]]
        }
      });
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

      return bot.sendMessage(
        telegramId,
        `📊 Прогресс: ${obtained}/${total}`
      );
    }

    // ===== ПОДПИСКА =====
    if (text === 'Карточка за подписку') {

      if (user.subscription_card_received) {
        return bot.sendMessage(telegramId, 'Ты уже получил эту карточку');
      }

      try {
        const member = await bot.getChatMember(`@${CHANNEL_USERNAME}`, telegramId);

        if (!['member', 'administrator', 'creator'].includes(member.status)) {
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
    }

    // ===== РЕФЕРАЛКА =====
    if (text === 'Пригласить друга') {
      const link = `https://t.me/${process.env.BOT_USERNAME}?start=ref_${telegramId}`;
      return bot.sendMessage(telegramId, link);
    }

  } catch (err) {
    console.error('ОШИБКА:', err);
    bot.sendMessage(telegramId, 'Ошибка. Проверь логи.');
  }
});

// ===== ЛИСТАНИЕ =====
bot.on('callback_query', async (query) => {
  const telegramId = query.from.id;
  const data = query.data;

  const cards = userSessions[telegramId];
  if (!cards) return;

  let index = Number(data.split('_')[1]);

  if (data.startsWith('next')) index++;
  else index--;

  if (index < 0) index = cards.length - 1;
  if (index >= cards.length) index = 0;

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
