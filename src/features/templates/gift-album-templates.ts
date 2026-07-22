export type GiftAlbumTemplate = {
  id: "couple-travel" | "anniversary" | "confession";
  name: string;
  occasion: string;
  prompts: {
    cover: string;
    photo: string;
    closing: string;
  };
};

export const giftAlbumTemplates: readonly GiftAlbumTemplate[] = [
  {
    id: "couple-travel",
    name: "一起出发",
    occasion: "情侣旅行纪念",
    prompts: {
      cover: "从这一站开始，我们把旅途收进一本册子。",
      photo: "写下这一张照片发生的瞬间。",
      closing: "下一次出发，也要一起。",
    },
  },
  {
    id: "anniversary",
    name: "我们的纪念日",
    occasion: "周年与特别日期",
    prompts: {
      cover: "把这个值得纪念的日子，留给未来的我们。",
      photo: "记录一个让你想微笑的片段。",
      closing: "愿每一个纪念日，都有新的故事。",
    },
  },
  {
    id: "confession",
    name: "想对你说",
    occasion: "告白与心意礼物",
    prompts: {
      cover: "有些话，想认真留在这一页。",
      photo: "这一张照片，是我想和你分享的理由。",
      closing: "谢谢你，让平常的日子变得特别。",
    },
  },
];
