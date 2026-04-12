const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// =====================
// USER CREATE / GET
// =====================
async function getOrCreateUser(telegramId) {
  let { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (!user) {
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        telegram_id: telegramId,
        consecutive_days: 0,
        last_card_date: null
      })
      .select()
      .single();

    if (error) {
      console.error('USER ERROR:', error);
      return null;
    }

    user = newUser;
  }

  return user;
}

// =====================
// START
// =====================
bot.onText(/\/start/, async (msg) => {
  const telegramId = msg.from.id;

  await getOrCreateUser(telegramId);

  bot.sendMessage(telegramId, '🌊 Melody River', {
    reply_markup: {
      keyboard: [
        ['🎴 Получить карточку'],
        ['📚 Коллекция'],
        ['📊 Прогресс']
      ],
      resize_keyboard: true
    }
  });
});

// =====================
// MAIN
// =====================
bot.on('message', async (msg) => {
  try {
    const telegramId = msg.from.id;
    const text = msg.text;

    if (!text) return;

    const user = await getOrCreateUser(telegramId);
    if (!user) return;

    const userId = user.id;

    // =====================
    // 🎴 ПОЛУЧИТЬ КАРТОЧКУ
    // =====================
    if (text === '🎴 Получить карточку') {

      const today = new Date().toISOString().slice(0, 10);

      // проверка 1 карточка в день
      const { data: existing } = await supabase
        .from('user_cards')
        .select('id')
        .eq('user_id', userId)
        .eq('date_received', today);

      if (existing && existing.length > 0) {
        return bot.sendMessage(telegramId, 'Ты уже получил карточку сегодня 🌊');
      }

      // уже полученные
      const { data: userCards } = await supabase
        .from('user_cards')
        .select('card_id')
        .eq('user_id', userId);

      const ownedIds = userCards?.map(c => c.card_id) || [];

      // все карточки
      const { data: cards } = await supabase
        .from('cards')
        .select('*')
        .eq('active', true);

      if (!cards || cards.length === 0) {
        return bot.sendMessage(telegramId, 'Карточек нет');
      }

      const available = cards.filter(c => !ownedIds.includes(c.id));

      if (available.length === 0) {
        return bot.sendMessage(telegramId, 'Ты собрал все карточки 🌊');
      }

      const card = available[Math.floor(Math.random() * available.length)];

      // сохраняем
      await supabase.from('user_cards').insert({
        user_id: userId,
        card_id: card.id,
        date_received: today,
        view_count: 0
      });

      await supabase
        .from('users')
        .update({
          last_card_date: today
        })
        .eq('id', userId);

      // отправка
      await bot.sendPhoto(telegramId, card.image_url, {
        caption: `🎴 ${card.text}`
      });

      return;
    }

    // =====================
    // 📚 КОЛЛЕКЦИЯ
    // =====================
    if (text === '📚 Коллекция') {

      const { data: userCards } = await supabase
        .from('user_cards')
        .select('card_id')
        .eq('user_id', userId);

      if (!userCards || userCards.length === 0) {
        return bot.sendMessage(telegramId, 'Коллекция пустая');
      }

      const ids = userCards.map(c => c.card_id);

      const { data: cards } = await supabase
        .from('cards')
        .select('*')
        .in('id', ids);

      if (!cards || cards.length === 0) {
        return bot.sendMessage(telegramId, 'Ошибка загрузки');
      }

      let message = `📚 Твоя коллекция:\n\n`;

      cards.forEach(c => {
        message += `🎴 ${c.text}\n`;
      });

      return bot.sendMessage(telegramId, message);
    }

    // =====================
    // 📊 ПРОГРЕСС
    // =====================
    if (text === '📊 Прогресс') {

      const { data: allCards } = await supabase
        .from('cards')
        .select('id');

      const { data: userCards } = await supabase
        .from('user_cards')
        .select('card_id')
        .eq('user_id', userId);

      const total = allCards?.length || 0;
      const obtained = userCards?.length || 0;

      const percent = total === 0 ? 0 : Math.round((obtained / total) * 100);

      return bot.sendMessage(
        telegramId,
        `📊 Прогресс\n\n${obtained}/${total}\n${percent}%`
      );
    }

  } catch (err) {
    console.error('ERROR:', err);
  }
});
