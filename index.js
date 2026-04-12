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

      if (!cards || cards.length === 0) {
        return bot.sendMessage(telegramId, 'Карточек пока нет');
      }

      const availableCards = cards.filter(c => !ownedIds.includes(c.id));

      if (availableCards.length === 0) {
        return bot.sendMessage(telegramId, 'Ты собрал все карточки 🌊');
      }

      // 🎲 простая редкость
      let pool = [];
      cards.forEach(c => {
        if (c.rarity === 'редкая') pool.push(...Array(1).fill(c));
        else pool.push(...Array(5).fill(c));
      });

      const card = availableCards[Math.floor(Math.random() * availableCards.length)];

      await bot.sendMessage(telegramId, '🌊 Ты входишь в поток...');

      await supabase.from('user_cards').insert({
        user_id: user.id,
        card_id: card.id,
        date_received: today
      });

      let caption = `🌊 Карточка дня\n\n${card.text}`;

      if (card.rarity !== 'обычная') {
        caption += '\n\n✨ Редкая карточка';
      }

      await bot.sendPhoto(telegramId, card.image_url, { caption });

      await bot.sendMessage(
        telegramId,
        'Эта карточка пришла к тебе сегодня не случайно'
      );

      if (availableCards.length <= 5) {
        await bot.sendMessage(telegramId, 'Ты почти собрал коллекцию 🌊');
      }
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

      let status = '🌱 Новичок';
      if (percent >= 25) status = '🌊 Исследователь';
      if (percent >= 50) status = '🏡 Житель';
      if (percent >= 75) status = '🧭 Хранитель';
      if (percent >= 100) status = '🌟 Мастер';

      return bot.sendMessage(
        telegramId,
        `📊 Твой путь:\n\n${obtained}/${total}\n${percent}%\n\nСтатус: ${status}`
      );
    }

    // ===== БОНУСЫ =====
    if (text === '🎁 Бонусы') {
      return bot.sendMessage(
        telegramId,
        `🎁 Доступно:\n\n— Подписка → редкая карточка\n— Пригласи друзей\n\nСкоро:\n— Серия дней`
      );
    }

    // ===== ПОДПИСКА =====
    if (text === 'Карточка за подписку') {

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
