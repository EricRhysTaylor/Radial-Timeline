// Quick test of date sorting logic

const scenes = [
    {
        title: "1 template scene",
        when: new Date("2025-11-18"),
        actNumber: 1
    },
    {
        title: "2 Template Scene",
        when: new Date("2025-10-29"),
        actNumber: 1
    }
];

console.log("BEFORE sorting:");
scenes.forEach(s => console.log(`  ${s.title}: ${s.when}`));

const sorted = scenes.slice().sort((a, b) => {
    const aWhen = a.when instanceof Date ? a.when : null;
    const bWhen = b.when instanceof Date ? b.when : null;
    
    console.log(`Comparing ${a.title} vs ${b.title}`);
    console.log(`  A when: ${aWhen}, B when: ${bWhen}`);
    
    if (aWhen && bWhen) {
        const timeDiff = aWhen.getTime() - bWhen.getTime();
        console.log(`  Time diff: ${timeDiff}`);
        return timeDiff;
    }
    
    return 0;
});

console.log("\nAFTER sorting:");
sorted.forEach(s => console.log(`  ${s.title}: ${s.when}`));

console.log("\nExpected order:");
console.log("  2 Template Scene: 2025-10-29 (earlier, should be first)");
console.log("  1 template scene: 2025-11-18 (later, should be second)");
