/*
 * Plot System Templates for Gossamer Scoring
 */

export interface PlotBeatInfo {
  name: string;
  description: string;
  placement?: string; // Formerly location/percentageRange: where this beat typically lands
  range?: string;     // Formerly momentumRange: ideal momentum/score band (0-100)
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
        placement: "0-1%",
        range: "0-10"
      },
      {
        name: "Theme Stated",
        description: "Someone (often not the protagonist) poses a question or statement that hints at what the story is really about. This thematic truth will be challenged and explored throughout the narrative. It's usually subtle and might go unnoticed by the protagonist initially.",
        placement: "5%",
        range: "5-15"
      },
      {
        name: "Setup",
        description: "Introduction to the protagonist's world, their relationships, routines, and the stakes. Show what's missing in their life and what they think they want. Establish the status quo that will be disrupted. Every element introduced here should have meaning or relevance to the story ahead.",
        placement: "1-10%",
        range: "10-20"
      },
      {
        name: "Catalyst",
        description: "The inciting incident that disrupts the protagonist's world. Something happens that presents a problem, opportunity, or challenge that cannot be ignored. This is the moment that sets the story in motion and introduces the central dramatic question.",
        placement: "10%",
        range: "25-35"
      },
      {
        name: "Debate",
        description: "The protagonist hesitates, questions, or resists the call to action. Internal conflict emerges as they weigh their options and wonder if they're ready for the journey ahead. This section builds tension as the audience anticipates the inevitable leap into Act Two.",
        placement: "10-20%",
        range: "20-30"
      },
      {
        name: "Break into 2",
        description: "The protagonist makes a choice and crosses the threshold into a new world or situation. They commit to the journey, leaving the familiar behind. This decision propels them into Act Two and sets the main story in motion. There's no turning back.",
        placement: "20%",
        range: "30-40"
      },
      {
        name: "B Story",
        description: "Introduction of a secondary storyline, often a relationship that provides emotional depth and thematic counterpoint to the main plot. This subplot typically explores the internal journey and helps the protagonist learn what they truly need (versus what they initially wanted).",
        placement: "22%",
        range: "35-45"
      },
      {
        name: "Fun and Games",
        description: "The promise of the premise. This is where the story delivers what the audience came for—the core concept in action. The protagonist explores the new world, enjoys initial successes, and we see the story's unique appeal. Tension exists but hasn't reached its peak yet.",
        placement: "20-50%",
        range: "40-55"
      },
      {
        name: "Midpoint",
        description: "A major turning point that raises the stakes and changes the direction of the story. Either a false victory (things seem great but complications loom) or a false defeat (things seem terrible but hope remains). Time clocks and deadlines often appear here, adding urgency.",
        placement: "50%",
        range: "60-70"
      },
      {
        name: "Bad Guys Close In",
        description: "The opponent's forces regroup and push back harder. Internal and external pressures mount. The protagonist's flaws or weaknesses are exposed. Relationships may fray. The easy wins from Fun and Games evaporate as real obstacles emerge and consequences become clear.",
        placement: "50-75%",
        range: "65-80"
      },
      {
        name: "All Is Lost",
        description: "The lowest point. The protagonist loses everything or believes they do. The goal seems impossible. This is often the moment of greatest despair, where hope appears lost. Something or someone important may be literally or figuratively lost. The 'whiff of death' moment.",
        placement: "75%",
        range: "75-85"
      },
      {
        name: "Dark Night of the Soul",
        description: "A moment of reflection and wallowing in defeat. The protagonist processes the loss, questions everything, and confronts their deepest fears. This quiet, internal moment allows both character and audience to feel the full weight of All Is Lost before the final push begins.",
        placement: "75-80%",
        range: "70-80"
      },
      {
        name: "Break into 3",
        description: "The protagonist has an epiphany or receives crucial information that provides a solution. They synthesize what they've learned from both the A Story and B Story. Armed with new understanding, they formulate a plan and commit to one final attempt. Hope returns with newfound wisdom.",
        placement: "80%",
        range: "75-85"
      },
      {
        name: "Finale",
        description: "The climactic confrontation where the protagonist applies everything they've learned. They must prove they've changed by using new skills, wisdom, or perspective gained through the journey. The A Story and B Story threads come together. The central question is answered, and the theme is proven.",
        placement: "80-99%",
        range: "85-100"
      },
      {
        name: "Final Image",
        description: "The 'after' snapshot that mirrors and contrasts with the Opening Image. Show how the protagonist and their world have transformed. This closing image should demonstrate that real change has occurred and reflect the thematic journey. The story comes full circle.",
        placement: "99-100%",
        range: "30-50"
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
        placement: "0-10%",
        range: "0-15"
      },
      {
        name: "Call to Adventure",
        description: "The hero is presented with a problem, challenge, or adventure. Something disrupts their Ordinary World and beckons them toward the unknown. This call may come from external events or internal yearning, but it demands a response and offers the possibility of change.",
        placement: "10%",
        range: "20-30"
      },
      {
        name: "Refusal of the Call",
        description: "The hero hesitates or declines the adventure, usually out of fear, obligation, or insecurity. They may feel unworthy, unprepared, or unwilling to leave their comfort zone. This reluctance makes them relatable and human, building anticipation for when they finally accept.",
        placement: "10-15%",
        range: "15-25"
      },
      {
        name: "Meeting the Mentor",
        description: "The hero encounters someone who provides guidance, training, gifts, or confidence needed for the journey. The mentor may be a person, a memory, or even an object that inspires. This meeting gives the hero what they need to overcome their fear and commit to the adventure.",
        placement: "15-20%",
        range: "25-35"
      },
      {
        name: "Crossing the Threshold",
        description: "The hero leaves the Ordinary World and enters the Special World of the adventure. This is the point of no return where they commit fully to the journey. The rules change, stakes rise, and the hero must adapt to this new and unfamiliar environment.",
        placement: "20-25%",
        range: "35-45"
      },
      {
        name: "Tests, Allies, Enemies",
        description: "The hero faces challenges, makes friends, identifies enemies, and learns the rules of the Special World. Through trials and encounters, they develop new skills and understanding. This section establishes the landscape of Act Two and builds toward greater challenges ahead.",
        placement: "25-50%",
        range: "40-60"
      },
      {
        name: "Approach to the Inmost Cave",
        description: "The hero prepares for the major challenge ahead, often literally or metaphorically approaching the place of greatest danger. Plans are made, final preparations completed, and the hero steels themselves for the Ordeal. Tension builds as the supreme test draws near.",
        placement: "50-60%",
        range: "55-70"
      },
      {
        name: "Ordeal",
        description: "The supreme test where the hero faces their greatest fear or most difficult challenge. This is a life-or-death moment (literally or symbolically) where everything hangs in the balance. The hero may appear to fail, die, or lose everything before emerging transformed.",
        placement: "60-70%",
        range: "75-90"
      },
      {
        name: "Reward (Seizing the Sword)",
        description: "Having survived the Ordeal, the hero claims their reward—knowledge, power, treasure, reconciliation, or love. They take possession of what they came for, though often it's different from what they originally sought. Success brings new understanding and confidence.",
        placement: "70-75%",
        range: "60-75"
      },
      {
        name: "The Road Back",
        description: "The hero begins the journey home but faces consequences or pursuit from their actions in the Special World. New complications arise, and forces may try to prevent their return. The hero must choose to complete the journey and bring their reward back to the Ordinary World.",
        placement: "75-80%",
        range: "70-80"
      },
      {
        name: "Resurrection",
        description: "The climactic final test where the hero must use everything they've learned. This is a last purification or rebirth before returning home. The stakes are highest here—often involving life and death for more than just the hero. They must prove their transformation is complete.",
        placement: "80-95%",
        range: "85-100"
      },
      {
        name: "Return with the Elixir",
        description: "The hero returns to the Ordinary World transformed and bearing something (knowledge, treasure, wisdom, or experience) that benefits their community. The journey is complete, the hero has grown, and life is better than before. The story comes full circle with meaningful change.",
        placement: "95-100%",
        range: "35-55"
      }
    ]
  },
  "Story Grid": {
    name: "Story Grid",
    beatCount: 5,
    beats: [
      "Inciting Incident",
      "Progressive Complications",
      "Crisis",
      "Climax",
      "Resolution"
    ],
    beatDetails: [
      {
        name: "Inciting Incident",
        description: "An external event disrupts the core value and creates a problem the protagonist cannot ignore.",
        placement: "0-10%",
        range: "10-25"
      },
      {
        name: "Progressive Complications",
        description: "Escalating obstacles that worsen the situation. Each complication raises stakes and limits options; no repetition—pressure increases.",
        placement: "10-70%",
        range: "25-60"
      },
      {
        name: "Crisis",
        description: "Binary choice: best bad option vs worst bad option. Forces the protagonist to risk what they value most.",
        placement: "70-85%",
        range: "60-80"
      },
      {
        name: "Climax",
        description: "Action taken to answer the Crisis question. Irreversible, value-charged decision.",
        placement: "85-95%",
        range: "80-100"
      },
      {
        name: "Resolution",
        description: "The new value state after the Climax. Shows cost, gain, and thematic meaning.",
        placement: "95-100%",
        range: "50-80"
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

