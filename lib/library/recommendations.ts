import "server-only";

import { getCategoryProgress } from "@/lib/library/progress";
import { getActiveLibraryMaterials, getUserLibraryProfile, type LibraryMaterialRow } from "@/lib/storage";
import { detectLibraryUserIntent } from "@/lib/library/user-profile";

export async function getNextRecommendedMaterial(userId: string, category: string) {
  const progress = await getCategoryProgress(userId, category);
  return progress.materials.find((material) => progress.statuses.get(material.id) !== "completed") ?? null;
}

export async function getNextMaterialAfter(userId: string, currentMaterial: LibraryMaterialRow) {
  const progress = await getCategoryProgress(userId, currentMaterial.category);
  const currentIndex = progress.materials.findIndex((material) => material.id === currentMaterial.id);

  if (currentIndex < 0) return null;
  return (
    progress.materials
      .slice(currentIndex + 1)
      .find((material) => progress.statuses.get(material.id) !== "completed") ?? null
  );
}

function normalize(value: string) {
  return value.toLowerCase().replaceAll("ё", "е").replace(/[^a-zа-я0-9]+/g, " ").trim();
}

function findMentionedMaterial(text: string, materials: LibraryMaterialRow[]) {
  const normalizedText = normalize(text);
  return materials.find((material) => {
    const normalizedTitle = normalize(material.title);
    if (normalizedText.includes(normalizedTitle)) return true;
    const meaningfulWords = normalizedTitle.split(" ").filter((word) => word.length >= 6);
    return meaningfulWords.length > 0 && meaningfulWords.filter((word) => normalizedText.includes(word)).length >= 2;
  });
}

function explainMaterial(material: LibraryMaterialRow) {
  if (material.slug === "vygruzi-golovu-za-7-min") {
    return [
      "«Выгрузи голову за 7 минут» — это короткая практика, чтобы вытащить из головы всё, что крутится фоном: задачи, тревоги, идеи и незакрытые хвосты.",
      "Смысл не просто прочитать, а реально сделать: открыть заметки или взять лист бумаги и за 7 минут выгрузить всё наружу. После этого обычно легче увидеть, что важно, что можно отложить, а что было просто шумом.",
    ].join("\n\n");
  }
  if (material.slug === "300-otzyvov-za-5-minut") {
    return [
      "«300 отзывов за 5 минут» — это прикладной способ быстро собрать много отзывов и с помощью AI увидеть повторяющиеся боли, желания и формулировки людей.",
      "Материал полезен, когда хочется не гадать, что важно аудитории, а опереться на живые повторяющиеся сигналы и превратить их в идеи для решений.",
    ].join("\n\n");
  }
  if (material.slug === "chto-komanda-poobeshchala-i-zabyla") {
    return [
      "Этот материал про то, как в команде теряются договорённости: кто-то пообещал, не зафиксировал, забыл, задача зависла, а потом всё всплывает в последний момент.",
      "Смысл — показать, как AI может помогать держать задачи, сроки и ответственность в поле зрения без ручного микроменеджмента.",
    ].join("\n\n");
  }
  return material.short_description;
}

export type ContextualLibraryReply = {
  text: string;
  route: "life" | "business";
  intent: ReturnType<typeof detectLibraryUserIntent>;
  suggestedMaterial: LibraryMaterialRow | null;
  reminderRequested: boolean;
};

export async function buildContextualLibraryReply(
  userId: string,
  userText: string,
): Promise<ContextualLibraryReply | null> {
  const [profile, materials] = await Promise.all([
    getUserLibraryProfile(userId),
    getActiveLibraryMaterials(),
  ]);
  const mentioned = findMentionedMaterial(userText, materials);
  const routeCandidate = mentioned?.category ?? profile?.last_route ?? profile?.last_category;
  if (routeCandidate !== "life" && routeCandidate !== "business") return null;

  const route = routeCandidate;
  const currentMaterial =
    mentioned ??
    materials.find((material) => material.slug === profile?.last_material_slug) ??
    null;
  const intent = detectLibraryUserIntent(userText);
  const categoryMaterials = materials.filter((material) => material.category === route);
  const nextMaterial = await getNextRecommendedMaterial(userId, route);
  const alternative =
    categoryMaterials.find((material) => material.id !== currentMaterial?.id) ?? nextMaterial;
  const materialLabel = currentMaterial ? `«${currentMaterial.title}»` : "этот материал";

  if (intent === "postponed") {
    return {
      text:
        currentMaterial?.slug === "vygruzi-golovu-za-7-min"
          ? "Окей, тогда не давлю 😄 Этот материал лучше не читать на бегу — там надо реально выделить 7 минут тишины и сделать практику по шагам. Если захочешь, могу позже напомнить или показать другой короткий материал."
          : `Окей, без давления. ${materialLabel} спокойно подождёт. Когда будет время, лучше не просто пролистать, а сразу примерить идею на свою ситуацию. Могу позже напомнить или показать следующий материал.`,
      route,
      intent,
      suggestedMaterial: alternative,
      reminderRequested: false,
    };
  }

  if (intent === "tried") {
    const question =
      currentMaterial?.slug === "vygruzi-golovu-za-7-min"
        ? "Круто. А что больше сработало: стало спокойнее в голове или просто стало понятнее, что сейчас висит фоном?"
        : currentMaterial?.slug === "300-otzyvov-za-5-minut"
          ? "Отлично. Что оказалось полезнее: повторяющиеся боли людей, их формулировки или идеи, которые из этого появились?"
          : "Хорошо. Что ближе к твоей ситуации: теряются сами задачи, сроки или ответственность между людьми?";
    return { text: question, route, intent, suggestedMaterial: alternative, reminderRequested: false };
  }

  if (intent === "confused") {
    const alternativeText = alternative
      ? `Если эта подача не зашла, могу вместо неё показать «${alternative.title}».`
      : "Если хочешь, могу объяснить идею ещё на одном простом примере.";
    return {
      text: `Понял, спорить не буду. Если совсем просто:\n\n${currentMaterial ? explainMaterial(currentMaterial) : "идея в том, чтобы вынести задачу из головы или хаотичного процесса наружу и дать AI помочь её структурировать."}\n\n${alternativeText}`,
      route,
      intent,
      suggestedMaterial: alternative,
      reminderRequested: false,
    };
  }

  if (intent === "recommendation") {
    const text = nextMaterial
      ? `Дальше я бы предложил «${nextMaterial.title}». ${nextMaterial.short_description}\n\nБез обязательств: открой, если тема сейчас действительно к месту.`
      : `В разделе «${route === "life" ? "AI для жизни" : "AI для бизнеса"}» ты уже прошёл все активные материалы. Можно вернуться в главное меню и выбрать другое направление.`;
    return { text, route, intent, suggestedMaterial: nextMaterial, reminderRequested: false };
  }

  if (intent === "material_question" && currentMaterial) {
    return {
      text: explainMaterial(currentMaterial),
      route,
      intent,
      suggestedMaterial: currentMaterial,
      reminderRequested: false,
    };
  }

  if (intent === "reminder_request") {
    return {
      text: "Хорошо, напомню мягко и без спама — не раньше чем через заданный интервал.",
      route,
      intent,
      suggestedMaterial: null,
      reminderRequested: true,
    };
  }

  if (intent === "smalltalk") {
    return {
      text: currentMaterial
        ? `Всё хорошо, я на связи 🙂 Кстати, держу в контексте, что ты смотрел ${materialLabel}. Можем продолжить по нему, выбрать другой материал или вернуться в главное меню.`
        : `Всё хорошо, я на связи 🙂 Можем выбрать материал по ${route === "life" ? "личному фокусу и AI-практикам" : "команде, процессам и автоматизации"} или вернуться в главное меню.`,
      route,
      intent,
      suggestedMaterial: alternative,
      reminderRequested: false,
    };
  }

  return {
    text:
      route === "life"
        ? `Понял тебя. Я держу в контексте ${currentMaterial ? `материал ${materialLabel}` : "тему AI для жизни"}. Можем продолжить по нему, перейти к другой личной AI-практике или вернуться в главное меню.`
        : `Понял тебя. Я держу в контексте ${currentMaterial ? `материал ${materialLabel}` : "тему AI для бизнеса"}. Можем продолжить про команду и процессы, открыть другой материал или вернуться в главное меню.`,
    route,
    intent,
    suggestedMaterial: alternative,
    reminderRequested: false,
  };
}
