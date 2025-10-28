/*
 * Plot System Templates for Gossamer Scoring
 */

export interface PlotBeatInfo {
  name: string;
  description: string;
  percentageRange?: string;
  momentumRange?: string; // Ideal momentum score range (0-100)
}

export interface PlotSystemTemplate {
  name: string;
  beatCount: number;
  beats: string[];
  beatDetails: PlotBeatInfo[];
}

export const PLOT_SYSTEMS: Record<string, PlotSystemTemplate> = {
  "Save The Cat": {
    name: "Save The Cat",
    beatCount: 15,
    beats: [
      "Opening Image",
      "Theme Stated",
      "Setup",
      "Catalyst",
      "Debate",
      "Break into 2",
      "B Story",
      "Fun and Games",
      "Midpoint",
      "Bad Guys Close In",
      "All Is Lost",
      "Dark Night of the Soul",
      "Break into 3",
      "Finale",
      "Final Image"
    ],
    beatDetails: [
      {
        name: "Opening Image",
        description: "The first impression of your story. A snapshot of the protagonist's life before the journey begins. This 'before' picture sets up the world and establishes what will change by the end. Show the protagonist in their everyday life, revealing the flaw or gap that will be addressed.",
        percentageRange: "0-1%",
        momentumRange: "0-10"
      },
      {
        name: "Theme Stated",
        description: "Someone (often not the protagonist) poses a question or statement that hints at what the story is really about. This thematic truth will be challenged and explored throughout the narrative. It's usually subtle and might go unnoticed by the protagonist initially.",
        percentageRange: "5%",
        momentumRange: "5-15"
      },
      {
        name: "Setup",
        description: "Introduction to the protagonist's world, their relationships, routines, and the stakes. Show what's missing in their life and what they think they want. Establish the status quo that will be disrupted. Every element introduced here should have meaning or relevance to the story ahead.",
        percentageRange: "1-10%",
        momentumRange: "10-20"
      },
      {
        name: "Catalyst",
        description: "The inciting incident that disrupts the protagonist's world. Something happens that presents a problem, opportunity, or challenge that cannot be ignored. This is the moment that sets the story in motion and introduces the central dramatic question.",
        percentageRange: "10%",
        momentumRange: "25-35"
      },
      {
        name: "Debate",
        description: "The protagonist hesitates, questions, or resists the call to action. Internal conflict emerges as they weigh their options and wonder if they're ready for the journey ahead. This section builds tension as the audience anticipates the inevitable leap into Act Two.",
        percentageRange: "10-20%",
        momentumRange: "20-30"
      },
      {
        name: "Break into 2",
        description: "The protagonist makes a choice and crosses the threshold into a new world or situation. They commit to the journey, leaving the familiar behind. This decision propels them into Act Two and sets the main story in motion. There's no turning back.",
        percentageRange: "20%",
        momentumRange: "30-40"
      },
      {
        name: "B Story",
        description: "Introduction of a secondary storyline, often a relationship that provides emotional depth and thematic counterpoint to the main plot. This subplot typically explores the internal journey and helps the protagonist learn what they truly need (versus what they initially wanted).",
        percentageRange: "22%",
        momentumRange: "35-45"
      },
      {
        name: "Fun and Games",
        description: "The promise of the premise. This is where the story delivers what the audience came for—the core concept in action. The protagonist explores the new world, enjoys initial successes, and we see the story's unique appeal. Tension exists but hasn't reached its peak yet.",
        percentageRange: "20-50%",
        momentumRange: "40-55"
      },
      {
        name: "Midpoint",
        description: "A major turning point that raises the stakes and changes the direction of the story. Either a false victory (things seem great but complications loom) or a false defeat (things seem terrible but hope remains). Time clocks and deadlines often appear here, adding urgency.",
        percentageRange: "50%",
        momentumRange: "60-70"
      },
      {
        name: "Bad Guys Close In",
        description: "The opponent's forces regroup and push back harder. Internal and external pressures mount. The protagonist's flaws or weaknesses are exposed. Relationships may fray. The easy wins from Fun and Games evaporate as real obstacles emerge and consequences become clear.",
        percentageRange: "50-75%",
        momentumRange: "65-80"
      },
      {
        name: "All Is Lost",
        description: "The lowest point. The protagonist loses everything or believes they do. The goal seems impossible. This is often the moment of greatest despair, where hope appears lost. Something or someone important may be literally or figuratively lost. The 'whiff of death' moment.",
        percentageRange: "75%",
        momentumRange: "75-85"
      },
      {
        name: "Dark Night of the Soul",
        description: "A moment of reflection and wallowing in defeat. The protagonist processes the loss, questions everything, and confronts their deepest fears. This quiet, internal moment allows both character and audience to feel the full weight of All Is Lost before the final push begins.",
        percentageRange: "75-80%",
        momentumRange: "70-80"
      },
      {
        name: "Break into 3",
        description: "The protagonist has an epiphany or receives crucial information that provides a solution. They synthesize what they've learned from both the A Story and B Story. Armed with new understanding, they formulate a plan and commit to one final attempt. Hope returns with newfound wisdom.",
        percentageRange: "80%",
        momentumRange: "75-85"
      },
      {
        name: "Finale",
        description: "The climactic confrontation where the protagonist applies everything they've learned. They must prove they've changed by using new skills, wisdom, or perspective gained through the journey. The A Story and B Story threads come together. The central question is answered, and the theme is proven.",
        percentageRange: "80-99%",
        momentumRange: "85-100"
      },
      {
        name: "Final Image",
        description: "The 'after' snapshot that mirrors and contrasts with the Opening Image. Show how the protagonist and their world have transformed. This closing image should demonstrate that real change has occurred and reflect the thematic journey. The story comes full circle.",
        percentageRange: "99-100%",
        momentumRange: "30-50"
      }
    ]
  },
  "Hero's Journey": {
    name: "Hero's Journey",
    beatCount: 12,
    beats: [
      "Ordinary World",
      "Call to Adventure",
      "Refusal of the Call",
      "Meeting the Mentor",
      "Crossing the Threshold",
      "Tests, Allies, Enemies",
      "Approach to the Inmost Cave",
      "Ordeal",
      "Reward (Seizing the Sword)",
      "The Road Back",
      "Resurrection",
      "Return with the Elixir"
    ],
    beatDetails: [
      {
        name: "Ordinary World",
        description: "The hero's normal life before the adventure begins. Establish who they are, what they believe, their relationships, and their routine. Show what's lacking or incomplete in their life. This familiar world will be contrasted with the Special World they're about to enter.",
        percentageRange: "0-10%",
        momentumRange: "0-15"
      },
      {
        name: "Call to Adventure",
        description: "The hero is presented with a problem, challenge, or adventure. Something disrupts their Ordinary World and beckons them toward the unknown. This call may come from external events or internal yearning, but it demands a response and offers the possibility of change.",
        percentageRange: "10%",
        momentumRange: "20-30"
      },
      {
        name: "Refusal of the Call",
        description: "The hero hesitates or declines the adventure, usually out of fear, obligation, or insecurity. They may feel unworthy, unprepared, or unwilling to leave their comfort zone. This reluctance makes them relatable and human, building anticipation for when they finally accept.",
        percentageRange: "10-15%",
        momentumRange: "15-25"
      },
      {
        name: "Meeting the Mentor",
        description: "The hero encounters someone who provides guidance, training, gifts, or confidence needed for the journey. The mentor may be a person, a memory, or even an object that inspires. This meeting gives the hero what they need to overcome their fear and commit to the adventure.",
        percentageRange: "15-20%",
        momentumRange: "25-35"
      },
      {
        name: "Crossing the Threshold",
        description: "The hero leaves the Ordinary World and enters the Special World of the adventure. This is the point of no return where they commit fully to the journey. The rules change, stakes rise, and the hero must adapt to this new and unfamiliar environment.",
        percentageRange: "20-25%",
        momentumRange: "35-45"
      },
      {
        name: "Tests, Allies, Enemies",
        description: "The hero faces challenges, makes friends, identifies enemies, and learns the rules of the Special World. Through trials and encounters, they develop new skills and understanding. This section establishes the landscape of Act Two and builds toward greater challenges ahead.",
        percentageRange: "25-50%",
        momentumRange: "40-60"
      },
      {
        name: "Approach to the Inmost Cave",
        description: "The hero prepares for the major challenge ahead, often literally or metaphorically approaching the place of greatest danger. Plans are made, final preparations completed, and the hero steels themselves for the Ordeal. Tension builds as the supreme test draws near.",
        percentageRange: "50-60%",
        momentumRange: "55-70"
      },
      {
        name: "Ordeal",
        description: "The supreme test where the hero faces their greatest fear or most difficult challenge. This is a life-or-death moment (literally or symbolically) where everything hangs in the balance. The hero may appear to fail, die, or lose everything before emerging transformed.",
        percentageRange: "60-70%",
        momentumRange: "75-90"
      },
      {
        name: "Reward (Seizing the Sword)",
        description: "Having survived the Ordeal, the hero claims their reward—knowledge, power, treasure, reconciliation, or love. They take possession of what they came for, though often it's different from what they originally sought. Success brings new understanding and confidence.",
        percentageRange: "70-75%",
        momentumRange: "60-75"
      },
      {
        name: "The Road Back",
        description: "The hero begins the journey home but faces consequences or pursuit from their actions in the Special World. New complications arise, and forces may try to prevent their return. The hero must choose to complete the journey and bring their reward back to the Ordinary World.",
        percentageRange: "75-80%",
        momentumRange: "70-80"
      },
      {
        name: "Resurrection",
        description: "The climactic final test where the hero must use everything they've learned. This is a last purification or rebirth before returning home. The stakes are highest here—often involving life and death for more than just the hero. They must prove their transformation is complete.",
        percentageRange: "80-95%",
        momentumRange: "85-100"
      },
      {
        name: "Return with the Elixir",
        description: "The hero returns to the Ordinary World transformed and bearing something (knowledge, treasure, wisdom, or experience) that benefits their community. The journey is complete, the hero has grown, and life is better than before. The story comes full circle with meaningful change.",
        percentageRange: "95-100%",
        momentumRange: "35-55"
      }
    ]
  },
  "Story Grid": {
    name: "Story Grid",
    beatCount: 15,
    beats: [
      "Act 1: Inciting Incident",
      "Act 1: Progressive Complication 1",
      "Act 1: Progressive Complication 2",
      "Act 1: Crisis",
      "Act 1: Climax",
      "Act 1: Resolution",
      "Act 2: Inciting Incident",
      "Act 2: Progressive Complications",
      "Act 2: Midpoint Shift",
      "Act 2: Crisis",
      "Act 2: Climax",
      "Act 2: Resolution",
      "Act 3: Crisis",
      "Act 3: Climax",
      "Act 3: Resolution"
    ],
    beatDetails: [
      {
        name: "Act 1: Inciting Incident",
        description: "An event beyond the protagonist's control that destabilizes their world and sets the main story in motion. This incident introduces the primary problem or opportunity that will drive the narrative. It disrupts the status quo and creates a need for change or action.",
        percentageRange: "0-12.5%",
        momentumRange: "15-25"
      },
      {
        name: "Act 1: Progressive Complication 1",
        description: "The first major obstacle or turning point that complicates the protagonist's situation. As they attempt to restore balance or pursue their goal, new problems emerge that make the path forward more difficult. Stakes begin to rise.",
        percentageRange: "12.5-18%",
        momentumRange: "20-30"
      },
      {
        name: "Act 1: Progressive Complication 2",
        description: "Another complication that further escalates the situation. The protagonist's initial strategies prove insufficient, forcing them to adapt. Pressure increases and the easy solutions are eliminated, pushing toward a critical decision point.",
        percentageRange: "18-23%",
        momentumRange: "25-35"
      },
      {
        name: "Act 1: Crisis",
        description: "The protagonist faces a difficult choice between two negative outcomes or two equally compelling options (a dilemma or paradox). This decision is truly difficult—there is no 'right' answer. The choice they make will determine the direction of their journey through Act Two.",
        percentageRange: "23-25%",
        momentumRange: "30-40"
      },
      {
        name: "Act 1: Climax",
        description: "The protagonist makes their choice from the Crisis, taking action that propels them into Act Two. This decision is irreversible and commits them to a new path. Their choice reveals character and establishes what kind of journey this will be.",
        percentageRange: "25%",
        momentumRange: "35-45"
      },
      {
        name: "Act 1: Resolution",
        description: "The immediate consequences of the Act I Climax become clear. We see how the protagonist's choice affects their world and relationships. New stakes are established as they enter the middle phase of their journey with complications already mounting.",
        percentageRange: "25-30%",
        momentumRange: "40-50"
      },
      {
        name: "Act 2: Inciting Incident",
        description: "A new destabilizing event that raises stakes and complicates the protagonist's pursuit of their goal. Just as they're adapting to Act Two, something happens that changes the game entirely. This incident shifts the terms of engagement and increases pressure.",
        percentageRange: "30-37.5%",
        momentumRange: "45-55"
      },
      {
        name: "Act 2: Progressive Complications",
        description: "A series of obstacles, setbacks, and escalating problems that test the protagonist through the middle portion of Act Two. Each complication makes the goal harder to achieve and reveals more about what's truly at stake. External and internal pressures mount simultaneously.",
        percentageRange: "37.5-50%",
        momentumRange: "50-65"
      },
      {
        name: "Act 2: Midpoint Shift",
        description: "A major revelation or reversal that transforms the protagonist's understanding of the situation or themselves. What they thought they knew is challenged. Strategies must change, and the second half of Act Two will be fundamentally different from the first. Often a point of no return.",
        percentageRange: "50%",
        momentumRange: "60-70"
      },
      {
        name: "Act 2: Crisis",
        description: "The protagonist faces another critical choice, but this time the stakes are much higher. Having learned from their journey so far, they must make a decision that will determine whether they can achieve their goal. This is often the most difficult choice in the story.",
        percentageRange: "62.5-75%",
        momentumRange: "70-80"
      },
      {
        name: "Act 2: Climax",
        description: "The protagonist acts on their Act II Crisis decision, making a choice that leads directly to the story's final confrontation. This action demonstrates how they've grown and what they've learned. It sets up the conditions for Act Three's resolution.",
        percentageRange: "75%",
        momentumRange: "75-85"
      },
      {
        name: "Act 2: Resolution",
        description: "The consequences of the Act II Climax play out, revealing the true scope of what the protagonist now faces. All threads converge as they head into the final act. The ultimate challenge is now clear and unavoidable.",
        percentageRange: "75-80%",
        momentumRange: "75-85"
      },
      {
        name: "Act 3: Crisis",
        description: "The final and most crucial decision point. The protagonist must choose how to face the ultimate challenge, often with everything they value at stake. This choice must demonstrate the full arc of their transformation and commit them to the final confrontation.",
        percentageRange: "80-87.5%",
        momentumRange: "80-90"
      },
      {
        name: "Act 3: Climax",
        description: "The protagonist takes decisive action based on their final Crisis choice. This is the ultimate test where they prove whether they've truly changed and learned what they needed to learn. Success or failure here determines the story's outcome and validates or challenges the theme.",
        percentageRange: "87.5-95%",
        momentumRange: "90-100"
      },
      {
        name: "Act 3: Resolution",
        description: "The aftermath and new equilibrium. All major questions are answered, relationships reach their final state, and we see the full impact of the protagonist's journey. The world has changed, the protagonist has changed, and the story's thematic statement is complete.",
        percentageRange: "95-100%",
        momentumRange: "40-60"
      }
    ]
  }
};

export const PLOT_SYSTEM_NAMES = Object.keys(PLOT_SYSTEMS);

export function getPlotSystem(name: string): PlotSystemTemplate | null {
  return PLOT_SYSTEMS[name] || null;
}

export function detectPlotSystemFromNotes(scenes: { itemType?: string; "Beat Model"?: string }[]): string {
  // Find any Beat note with Beat Model field (prefer Beat over Plot for new templates)
  const beatNote = scenes.find(s => s.itemType === 'Beat' && s["Beat Model"]);
  const plotNote = scenes.find(s => s.itemType === 'Plot' && s["Beat Model"]);
  
  // Prefer Beat notes over Plot notes (legacy)
  const targetNote = beatNote || plotNote;
  
  if (targetNote && targetNote["Beat Model"]) {
    // Check if it's a recognized system
    if (PLOT_SYSTEMS[targetNote["Beat Model"]]) {
      return targetNote["Beat Model"];
    }
  }
  
  // Default to Save The Cat if not found or unrecognized
  return "Save The Cat";
}

