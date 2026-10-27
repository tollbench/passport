// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
// Short plain descriptions the organizer compares saved answers against.
// Edit freely: each list is a few phrases that sound like answers in that place.
// Keys must stay topic-catalog request types; unknown keys are ignored.

export const TOPIC_HINTS = Object.freeze({
  'person.biography': ['about me, my life story and background', 'where I grew up, my hometown and family history', 'my job, my hobbies and my interests'],
  'person.food_preference': ['food I like to eat, my favorite dishes', 'favorite cuisine, restaurants and meals', 'snacks, drinks and desserts I love'],
  'person.contact_preference': ['how to reach me: phone, text or email', 'the best time and way to contact me', 'call me, message me, my phone number'],
  'pet.diet': ['what my pet eats: dog food, cat food', 'feeding my dog or cat, pet treats', "my pet's diet and meals"],
  'organization.target_audience': ['the target customers and ideal buyers', 'the market segment the business sells to', 'clients who buy our products'],
  'organization.description': ['what our company does, its products and services', 'about our business, the firm and its mission', 'the company name, industry and brand'],
  'project.target_audience': ['who this project is for, its audience', 'the listeners, viewers or readers of the song, video or campaign', 'the people the project should reach'],
  'project.pitch_angle': ['the pitch angle, the hook', 'the main message and story angle', 'why it matters, the selling point'],
  'project.description': ['what the project is about', 'the plan, goals and details of the project', 'the project brief and deliverables'],
  'project.communication_tone': ['the tone and voice: formal or casual', 'friendly, funny, warm, serious or playful style', 'how it should sound and feel'],
  'project.podcast_preferences': ['podcast shows and episodes', 'podcast format, guests and interview topics', 'favorite podcasts to listen to or appear on'],
  'person.food_restrictions': ['food allergies and dietary restrictions', 'vegetarian, vegan, gluten-free, kosher or halal', 'foods I cannot eat or avoid'],
});

export const BOOK_HINTS = Object.freeze({
  personal: ['my family, friends and home', 'birthday, wedding, anniversary, my partner and kids', 'my health, hobbies and personal life', 'a gift for my mom, my sister, my dad'],
  business: ['my company, business and brand', 'clients, customers, revenue and sales', 'budget, invoices, employees and marketing', 'our startup, LLC, firm, agency or store'],
});

// Question scaffolding that says little about meaning. These count for half.
export const FUNCTION_WORDS = Object.freeze(('a an the is are was were be been being am do does did what which who whom whose how when where why ' +
  'this that these those it its of to in on at by with about as or and if so can could should would will shall may might must ' +
  'we us our you your yours i me my mine they them their he she his her please tell share describe give any some there here let').split(' '));

export const TUNING = Object.freeze({
  functionWordWeight: 0.5, // weight of FUNCTION_WORDS tokens; punctuation-only tokens weigh 0
  rankMin: 0.15,           // cosine below this is "clearly unrelated" and dropped
  topicMin: 0.35,          // best topic must reach this cosine...
  topicMargin: 0.03,       // ...and beat the runner-up by this much, else topic is null
  bookMargin: 0.03,        // business wins only by this margin; ties go to personal
  bookPrior: 0.08,         // person/pet topics lean personal, organization topics lean business
});
