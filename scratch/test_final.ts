import { BrowserAgent } from '../src/services/ai/BrowserAgent.js';

async function main() {
  console.log("🚀 STARTING FINAL BROWSER AGENT TEST...");
  // Use a goal that requires navigation, typing, and clicking a specific element
  const agent = new BrowserAgent({ maxSteps: 5 });
  
  try {
    const result = await agent.runTask({
      goal: "Go to https://google.com, search for 'Claude 3.5', and click on the first link that goes to Anthropic's official website."
    });
    
    const fs = await import('fs');
    fs.writeFileSync('scratch/test_final_result.json', JSON.stringify(result, null, 2));
    
    console.log("\n✅ TEST COMPLETED SUCCESSFULLY:");
    console.log(JSON.stringify(result, null, 2));
    
  } catch (err: any) {
    const fs = await import('fs');
    fs.writeFileSync('scratch/test_final_result.json', JSON.stringify({ error: err.message }));
    
    console.error("\n❌ TEST FAILED:");
    console.error(err.message);
  }
  
  process.exit(0);
}

main();
