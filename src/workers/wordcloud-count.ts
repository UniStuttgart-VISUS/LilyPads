const ctx: Worker = self as any;

// Respond to message from parent thread
ctx.onmessage = (ev) => {
  const data: Array<any> = ev.data;
  const reply = calculateWordcloud(data);
  ctx.postMessage(reply);
};

function calculateWordcloud(data: Array<any>): Array<any> {
  console.time('worker: calculating wordcloud');
  let words = new Map<string, {count: number, occurences: number, score: number, articles: Set<number>}>();
  const add = function(word: string, article_index: number, count: number, score: number) {
    if (words.has(word)) {
      const w = words.get(word);
      w.count += 1;
      w.occurences += count;
      w.score += score;
      w.articles.add(article_index);
    } else {
      words.set(word, {
        count: 1,
        occurences: count,
        score,
        articles: new Set([article_index])
      });
    }
  };

  data.forEach(function(datum) {
    Object.entries(datum.wordcounts)
      .forEach(function([word, [count, score]]: [string, [number, number]]) {
        add(word, datum.Index, count, score);
      });
  });

  const w1 = Array.from(words.entries()).map(([word, prop]
    :[string, {count: number, occurences: number, score: number, articles: Set<number>}]
  ) => {
    prop['text'] = word;
    return prop;
  }).sort((a,b) => (b.score - a.score))
    .slice(0, 80);

  let d2 = w1.map((w: any) => {
    let articles = [];
    w.articles.forEach(d => articles.push(d));
    w.articles = articles;
    w.dateAvg = colorForWeightedDates(articles.map(d => {
        return data.filter(x => x.Index == d)[0].Date;
      }));
    return w;
  });

  console.timeEnd('worker: calculating wordcloud');

  return d2;
}

function colorForWeightedDates(dates: Array<Date>): Date {
  // get average point in time for list
  const avg = dates.reduce(function(accum: number, cur: Date) : number {
    return accum + cur.getTime();
  }, 0) / dates.length;
  return new Date(avg);
}
