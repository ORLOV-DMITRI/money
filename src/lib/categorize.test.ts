import { expect, it } from "vitest";
import { suggestCategory } from "./categorize";

const cats = [
  { id: "1", name: "Кафе", kind: "expense" as const, archived: false, keywords: ["кофе", "обед"] },
  { id: "2", name: "Такси", kind: "expense" as const, archived: false, keywords: ["такси", "яндекс go"] },
  { id: "3", name: "Продукты", kind: "expense" as const, archived: false, keywords: ["молоко"] },
  { id: "9", name: "Зарплата", kind: "income" as const, archived: false, keywords: ["зп"] },
];

it("ключевые слова, в том числе словоформы и фразы", () => {
  expect(suggestCategory("Кофе с собой", cats)).toBe("1");
  expect(suggestCategory("такси домой", cats)).toBe("2");
  expect(suggestCategory("Яндекс Go", cats)).toBe("2");
  expect(suggestCategory("молоком", cats)).toBe("3");
});
it("история важнее ключевых слов при точном совпадении", () => {
  expect(suggestCategory("кофе", cats, [{ note: "Кофе", categoryId: "3" }])).toBe("3");
});
it("частичное совпадение с историей", () => {
  expect(suggestCategory("шаурма большая", cats, [{ note: "Шаурма", categoryId: "1" }])).toBe("1");
});
it("учитывает тип", () => {
  expect(suggestCategory("зп", cats, [], "income")).toBe("9");
  expect(suggestCategory("зп", cats)).toBeUndefined();
});
