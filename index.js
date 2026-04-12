const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const CHANNEL_USERNAME = '@melodyriverchannel';
const userSessions = {};

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  const telegramId = msg.from.id;

  await getOrCreateUser(telegramId);

  bot.sendMessage(telegramId, '🌊 Melody River', {
    reply_markup: {
      keyboard: [
        ['🎴 Получить карточку', '📚 Коллекция'],
        ['🎁 Бонусы', '📊 Прогресс']
      ],
      resize_keyboard: true
    }
  });
});

// ===== ПОЛУЧИТЬ / СОЗДАТЬ USER =====
async function getOrCreateUser(telegramId) {
  let { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (!user) {
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({ telegram_id: telegramId })
      .select()
      .single();

    if (error) {
      console.error('Ошибка создания user:', error);
      return null;
    }

    user = newUser;
  }

  return user;
}

// ===== ОСНОВНАЯ ЛОГИКА =====
bot.on('message', async (msg) => {
  try {
    const telegramId = msg.from.id;
    const text = msg.text;

    if (!text) return;

    const user = await getOrCreateUser(telegramId);
    if (!user) return;

    const userId = user.id;

    // ===== ПОЛУЧИТЬ КАРТОЧКУ =====
    if (text === '🎴 Получить карточку') {
      const today = new Date().toISOString().slice(0, 10);

      const { data: existing } = await supabase
        .from('user_cards')
        .select('id')
        .eq('user_id', userId)
        .eq('date_received', today);

      if (existing.length > 0) {
        return bot.sendMessage(telegramId, 'Ты уже получил карточку сегодня 🌊');
      }

      const { data: userCards } = await supabase
        .from('user_cards')
        .select('card_id')
        .eq('user_id', userId);

      const ownedIds = userCards.map(c => c.card_id);

      const { data: cards } = await supabase
        .from('cards')
        .select('*')
        .eq('active', true);

      const availableCards = cards.filter(c => !ownedIds.includes(c.id));

      if (availableCards.length === 0) {
        return bot.sendMessage(telegramId, 'Ты собрал все карточки 🌊');
      }

      const card = availableCards[Math.floor(Math.random() * availableCards.length)];

      // 🔥 КРИТИЧНО — ЖДЁМ insert
      await supabase.from('user_cards').insert({
        user_id: userId,
        card_id: card.id,
        date_received: today
      });

      await bot.sendPhoto(telegramId, card.image_url, {
        caption: card.text
      });

      if (availableCards.length <= 5) {
        await bot.sendMessage(telegramId, '🌊 Ты почти собрал всю коллекцию');
      }
    }

    // ===== КОЛЛЕКЦИЯ =====
    if (text === '📚 Коллекция') {
      const { data: userCards } = await supabase
        .from('user_cards')
        .select('card_id')
        .eq('user_id', userId);

      if (!userCards || userCards.length === 0) {
        return bot.sendMessage(telegramId, 'У тебя пока нет карточек');
      }

      const cardIds = userCards.map(c => c.card_id);

      const { data: cards } = await supabase
        .from('cards')
        .select('*')
        .in('id', cardIds);

      const card = cards[0];

      userSessions[telegramId] = cards;

      bot.sendPhoto(telegramId, card.image_url, {
        caption: card.text,
        reply_markup: {
          inline_keyboard: [[
            { text: '⬅️', callback_data: `prev_0` },
            { text: '➡️', callback_data: `next_0` }
          ]]
        }
      });
    }

    // ===== БОНУСЫ =====
    if (text === '🎁 Бонусы') {
      bot.sendMessage(telegramId, 'Выбери действие:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📲 Подписаться', url: 'https://t.me/melodyriverchannel' }],
            [{ text: '✅ Проверить подписку', callback_data: 'check_sub' }]
          ]
        }
      });
    }

    // ===== ПРОГРЕСС =====
    if (text === '📊 Прогресс') {
      const { data: allCards } = await supabase.from('cards').select('id');
      const { data: userCards } = await supabase
        .from('user_cards')
        .select('card_id')
        .eq('user_id', userId);

      const total = allCards.length;
      const obtained = userCards.length;

      const percent = Math.round((obtained / total) * 100);

      bot.sendMessage(
        telegramId,
        `📊 Прогресс:\n${obtained} / ${total}\n${percent}%`
      );
    }

  } catch (err) {
    console.error('ОШИБКА:', err);
  }
});

// ===== CALLBACK =====
bot.on('callback_query', async (query) => {
  const telegramId = query.from.id;
  const data = query.data;

  const user = await getOrCreateUser(telegramId);
  if (!user) return;

  const userId = user.id;

  // ===== ЛИСТАНИЕ =====
  if (data.startsWith('next') || data.startsWith('prev')) {
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
  }

  // ===== ПОДПИСКА =====
  if (data === 'check_sub') {
    try {
      const member = await bot.getChatMember(CHANNEL_USERNAME, telegramId);

      if (['member', 'administrator', 'creator'].includes(member.status)) {
        return bot.sendMessage(telegramId, '✅ Подписка подтверждена');
      } else {
        return bot.sendMessage(telegramId, '❌ Ты не подписан');
      }
    } catch (err) {
      console.error(err);
      return bot.sendMessage(telegramId, 'Ошибка проверки подписки');
    }
  }
});
