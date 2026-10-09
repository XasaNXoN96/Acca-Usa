import type { LegalDocs } from "./types";

export const refunds: LegalDocs = {
  en: {
    title: "Refund Policy",
    intro: "How refunds work on ACCA USA. Operator: {operator}. Questions: {contact}.",
    sections: [
      { heading: "1. When you can ask", body: ["Refund window for paid access: {refundDays}. Write to {contact} with the e-mail of your account and the payment reference shown in Payments."] },
      { heading: "2. How it is processed", body: ["Approved refunds are issued to the original payment method through the payment provider; the time until the money reaches you depends on your bank. We cannot refund by any other method."] },
      { heading: "3. What happens to your access", body: ["A full refund withdraws the access that payment granted. A partial refund keeps your access unless we tell you otherwise in writing. Access is changed only when the payment provider confirms the refund, never because of an e-mail or a screenshot."] },
      { heading: "4. Your statutory rights", body: ["This policy does not limit rights you have under mandatory consumer-protection law."] },
    ],
  },
  ru: {
    title: "Политика возврата",
    intro: "Как работают возвраты в ACCA USA. Оператор: {operator}. Вопросы: {contact}.",
    sections: [
      { heading: "1. Когда можно обратиться", body: ["Срок для возврата платного доступа: {refundDays}. Напишите на {contact}, указав e-mail аккаунта и номер платежа из раздела «Платежи»."] },
      { heading: "2. Как проходит возврат", body: ["Одобренный возврат выполняется на исходный способ оплаты через платёжного провайдера; срок поступления денег зависит от вашего банка. Другим способом вернуть средства мы не можем."] },
      { heading: "3. Что происходит с доступом", body: ["Полный возврат закрывает доступ, который открыл этот платёж. При частичном возврате доступ сохраняется, если мы не сообщили иное письменно. Доступ меняется только после подтверждения возврата платёжным провайдером, а не по письму или скриншоту."] },
      { heading: "4. Ваши права по закону", body: ["Эта политика не ограничивает права, которые вам дают императивные нормы о защите прав потребителей."] },
    ],
  },
  uz: {
    title: "Pulni qaytarish siyosati",
    intro: "ACCA USA’da pulni qaytarish qanday ishlaydi. Operator: {operator}. Savollar: {contact}.",
    sections: [
      { heading: "1. Qachon murojaat qilish mumkin", body: ["Pullik kirish uchun qaytarish muddati: {refundDays}. Hisobingiz e-pochtasi va “To‘lovlar” bo‘limidagi to‘lov raqamini ko‘rsatib, {contact} manziliga yozing."] },
      { heading: "2. Qanday amalga oshiriladi", body: ["Tasdiqlangan qaytarish to‘lov provayderi orqali dastlabki to‘lov usuliga amalga oshiriladi; pul sizga yetib borish muddati bankingizga bog‘liq. Boshqa usulda qaytara olmaymiz."] },
      { heading: "3. Kirish nima bo‘ladi", body: ["To‘liq qaytarish ushbu to‘lov bergan kirishni bekor qiladi. Qisman qaytarishda, yozma ravishda boshqacha aytmasak, kirish saqlanadi. Kirish faqat to‘lov provayderi qaytarishni tasdiqlaganda o‘zgaradi, xat yoki skrinshot bo‘yicha emas."] },
      { heading: "4. Qonuniy huquqlaringiz", body: ["Ushbu siyosat iste’molchi huquqlarini himoya qilish bo‘yicha majburiy normalar bergan huquqlaringizni cheklamaydi."] },
    ],
  },
};
