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
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId);

  if (users && users.length > 0) return users[0];

  const { data: newUsers } = await supabase
    .from('users')
    .insert({ telegram_id: telegramId })
    .select();

  return newUsers?.[0];
}

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  const telegramId = msg.from.id;

  await getOrCreateUser(telegramId);

  bot.sendMessage(telegramId, '🌊 Добро пожаловать в Melody River', {
    reply_markup: {
      keyboard: [
        ['🌊 Получить'],
        ['🧭 Коллекция', '📊 Путь'],
        ['🎁 Бонусы', '👥 Пригласить']
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

  const user = await getOrCreateUser(telegramId);
  if (!user) return bot.sendMessage(telegramId, 'Ошибка. Напиши /start');

  try {

    // ===== ПОЛУЧИТЬ =====
    if (text === '🌊 Получить') {

      const today = new Date().toISOString().slice(0, 10);

      const { data: existing } = await supabase
        .from('user_cards')
        .select('id')
        .eq('user_id', user.id)
        .eq('date_received', today);

      if (existing?.length > 0) {
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

      const availableCards = cards.filter(c => !ownedIds.includes(c.id));

      if (availableCards.length === 0) {
        return bot.sendMessage(telegramId, 'Ты собрал все карточки 🌊');
      }

      const card = availableCards[Math.floor(Math.random() * availableCards.length)];

      await bot.sendMessage(telegramId, '🌊 Ты входишь в поток...');

      await supabase.from('user_cards').insert({
        user_id: user.id,
        card_id: card.id,
        date_received: today
      });

      return bot.sendPhoto(telegramId, card.image_url, {
        caption: `🌊 Карточка дня\n\n${card.text}`
      });
    }

    // ===== КОЛЛЕКЦИЯ =====
    if (text === '🧭 Коллекция') {

      const { data: userCards } = await supabase
        .from('user_cards')
        .select('card_id')
        .eq('user_id', user.id);

      if (!userCards?.length) {
        return bot.sendMessage(telegramId, 'У тебя пока нет карточек');
      }

      const ids = userCards.map(c => c.card_id);

      const { data: cards } = await supabase
        .from('cards')
        .select('*')
        .in('id', ids);

      userSessions[telegramId] = cards;

      const card = cards[0];

      return bot.sendPhoto(telegramId, card.image_url, {
        caption: `🧭 Карточка 1 из ${cards.length}\n\n${card.text}`,
        reply_markup: {
          inline_keyboard: [[
            { text: '⬅️', callback_data: 'prev_0' },
            { text: '➡️', callback_data: 'next_0' }
          ]]
        }
      });
    }

    // ===== ПРОГРЕСС =====
    if (text === '📊 Путь') {

      const { data: allCards } = await supabase
        .from('cards')
        .select('id');

      const { data: userCards } = await supabase
        .from('user_cards')
        .select('card_id')
        .eq('user_id', user.id);

      const total = allCards?.length || 0;
      const obtained = userCards?.length || 0;

      const percent = total ? Math.round((obtained / total) * 100) : 0;

      return bot.sendMessage(
        telegramId,
        `📊 Твой путь:\n\n${obtained}/${total}\n${percent}%`
      );
    }

    // ===== БОНУСЫ (UX СЦЕНАРИЙ) =====
    if (text === '🎁 Бонусы') {
      return bot.sendMessage(
        telegramId,
        '🎁 Получи бонусную карточку:',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📢 Подписаться на канал', url: `https://t.me/${CHANNEL_USERNAME}` }],
              [{ text: '✅ Проверить подписку', callback_data: 'check_sub' }]
            ]
          }
        }
      );
    }

    // ===== РЕФЕРАЛКА =====
    if (text === '👥 Пригласить') {
      const link = `https://t.me/${process.env.BOT_USERNAME}?start=ref_${telegramId}`;
      return bot.sendMessage(telegramId, link);
    }

  } catch (err) {
    console.error(err);
    bot.sendMessage(telegramId, 'Ошибка');
  }
});

// ===== CALLBACK =====
bot.on('callback_query', async (query) => {
  const telegramId = query.from.id;
  const data = query.data;

  const user = await getOrCreateUser(telegramId);
  if (!user) return;

  // ===== ПРОВЕРКА ПОДПИСКИ =====
  if (data === 'check_sub') {

    try {
      const member = await bot.getChatMember(`@${CHANNEL_USERNAME}`, telegramId);

      if (!['member', 'administrator', 'creator'].includes(member.status)) {
        return bot.sendMessage(telegramId, 'Ты ещё не подписан');
      }

    } catch {
      return bot.sendMessage(telegramId, 'Ошибка проверки');
    }

    return bot.sendMessage(
      telegramId,
      '🔥 Подписка подтверждена!',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎁 Получить карточку', callback_data: 'get_sub_card' }]
          ]
        }
      }
    );
  }

  // ===== ВЫДАЧА КАРТОЧКИ ЗА ПОДПИСКУ =====
  if (data === 'get_sub_card') {

    const { data: cards } = await supabase
      .from('cards')
      .select('*')
      .eq('special_type', 'subscription');

    if (!cards?.length) {
      return bot.sendMessage(telegramId, 'Карточка не найдена');
    }

    const card = cards[0];

    await supabase.from('user_cards').insert({
      user_id: user.id,
      card_id: card.id,
      date_received: new Date().toISOString().slice(0, 10)
    });

    return bot.sendPhoto(telegramId, card.image_url, {
      caption: `🎁 Бонусная карточка\n\n${card.text}`
    });
  }

  // ===== ЛИСТАНИЕ =====
  const cards = userSessions[telegramId];
  if (!cards) return;

  let index = Number(data.split('_')[1]);

  if (data.startsWith('next')) index++;
  else if (data.startsWith('prev')) index--;

  if (index < 0) index = cards.length - 1;
  if (index >= cards.length) index = 0;

  const card = cards[index];

  bot.editMessageMedia(
    {
      type: 'photo',
      media: card.image_url,
      caption: `🧭 Карточка ${index + 1} из ${cards.length}\n\n${card.text}`
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
