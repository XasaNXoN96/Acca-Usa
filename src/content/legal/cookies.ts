import type { LegalDocs } from "./types";

/** Cookie facts mirror the code: session cookies are set in lib/auth/session.ts, preferences in i18n/actions.ts, lib/theme-client.ts, lib/sidebar-client.ts. */
export const cookies: LegalDocs = {
  en: {
    title: "Cookie Notice",
    intro: "ACCA USA uses only the cookies it needs to work and to remember your choices. It sets no advertising or analytics cookies, so there is no cookie banner to accept. If that ever changes we will ask for your consent first.",
    sections: [
      { heading: "Strictly necessary", body: ["acca_session — keeps you signed in (HTTP-only, up to 7 days, deleted when you sign out).", "acca_mfa — administrators only: the five-minute step between password and verification code (HTTP-only)."] },
      { heading: "Preferences you choose", body: ["NEXT_LOCALE — your language (1 year).", "acca_theme — light / dark / system appearance (1 year, only after you change it).", "acca_sidebar — collapsed or expanded side menu (1 year, only after you change it)."] },
      { heading: "Third parties", body: ["When you pay by card, the payment provider's own page may set its own cookies; they are governed by that provider's notice. We do not embed trackers, advertising or social-media widgets."] },
      { heading: "Control", body: ["You can delete cookies in your browser at any time; you will then be signed out and your preferences reset. Blocking the necessary cookies means you cannot sign in."] },
    ],
  },
  ru: {
    title: "Уведомление о cookie",
    intro: "ACCA USA использует только cookie, необходимые для работы и запоминания ваших настроек. Рекламных и аналитических cookie нет, поэтому баннера согласия нет. Если это изменится, мы сначала запросим ваше согласие.",
    sections: [
      { heading: "Строго необходимые", body: ["acca_session — поддерживает вход (HTTP-only, до 7 дней, удаляется при выходе).", "acca_mfa — только администраторы: пятиминутный шаг между паролем и кодом подтверждения (HTTP-only)."] },
      { heading: "Настройки, которые выбираете вы", body: ["NEXT_LOCALE — язык (1 год).", "acca_theme — светлая / тёмная / системная тема (1 год, только после изменения).", "acca_sidebar — свёрнутое или развёрнутое боковое меню (1 год, только после изменения)."] },
      { heading: "Третьи стороны", body: ["При оплате картой страница платёжного провайдера может устанавливать собственные cookie; на них распространяется уведомление этого провайдера. Мы не встраиваем трекеры, рекламу или виджеты соцсетей."] },
      { heading: "Управление", body: ["Вы можете удалить cookie в браузере в любой момент; вы выйдете из аккаунта, а настройки сбросятся. Если заблокировать необходимые cookie, войти не получится."] },
    ],
  },
  uz: {
    title: "Cookie xabarnomasi",
    intro: "ACCA USA faqat ishlashi va tanlovlaringizni eslab qolishi uchun zarur cookie’lardan foydalanadi. Reklama yoki analitika cookie’lari yo‘q, shuning uchun qabul qilinadigan cookie bannerining keragi yo‘q. Bu o‘zgarsa, avval roziligingizni so‘raymiz.",
    sections: [
      { heading: "Qat’iy zarur", body: ["acca_session — tizimda qolishingizni ta’minlaydi (HTTP-only, 7 kungacha, chiqqaningizda o‘chiriladi).", "acca_mfa — faqat administratorlar: parol va tasdiqlash kodi orasidagi besh daqiqalik qadam (HTTP-only)."] },
      { heading: "O‘zingiz tanlaydigan sozlamalar", body: ["NEXT_LOCALE — tilingiz (1 yil).", "acca_theme — yorug‘ / qorong‘i / tizim mavzusi (1 yil, faqat o‘zgartirganingizdan keyin).", "acca_sidebar — yig‘ilgan yoki yoyilgan yon menyu (1 yil, faqat o‘zgartirganingizdan keyin)."] },
      { heading: "Uchinchi tomonlar", body: ["Karta bilan to‘laganingizda to‘lov provayderi sahifasi o‘z cookie’larini o‘rnatishi mumkin; ularga o‘sha provayderning xabarnomasi tatbiq etiladi. Biz treker, reklama yoki ijtimoiy tarmoq vidjetlarini joylashtirmaymiz."] },
      { heading: "Boshqarish", body: ["Cookie’larni brauzerda istalgan vaqtda o‘chirishingiz mumkin; shunda tizimdan chiqasiz va sozlamalar tiklanadi. Zarur cookie’larni bloklasangiz, kira olmaysiz."] },
    ],
  },
};
