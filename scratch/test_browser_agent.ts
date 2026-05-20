console.log("🧪 Test script loading...");
import { BrowserAgent } from '../src/services/ai/BrowserAgent.js';

async function test() {
  console.log("🚀 Starting Field Test for BrowserAgent...");
  const agent = new BrowserAgent({ maxSteps: 5 });
  
  try {
    const result = await agent.runTask({ 
      goal: "Go to google.com and search for 'Claude Code GitHub'. Tell me the title of the first search result." 
    });
    console.log("\n🎊 TEST RESULT:");
    console.log(result);
  } catch (error: any) {
    console.error("\n❌ TEST FAILED:");
    console.error(error.message);
  }
}

test();
