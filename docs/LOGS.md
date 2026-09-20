7c3aea4 - inital thoughts on test:

- the functionality is SO SO cool and better than what we had before.
- going to keep checking for bugs with the dry feature - hard to tell if it's working right
- don't like how the brush is always like... uniform width and very square but i guess that might be inevitable. something to note and continue working on though
- good that we get options to tune but nobody is using that like it isn't very user friendly, even artist friendly, without explanation
- don't really understand the physics behind running out of paint on the paper - like why does it still look textured even tho there's no paint left
- want to be able to make non-rectangular moves, for example a single dot for texture.
- overall a great start 
- also, like it felt like the paint is mixing with the "white" of the canvas, treating the canvas as paint or something... which is not how it actually works? (lowkey fixed now)

eventually:

- going to allow people to choose/put back brushes, wash them..
- a real paint palette which is the messy styrofoam - the paint on there (drying, etc) COULD also affect the outcome. to think about later...
- the paints would be labelled and inside tubes

![screenshot](Screenshot 2026-09-19 at 9.41.29 PM)

for the paint interacting with canvas thing: "Proper fix, about an hour. Keep the ground, the wet paint colour and how much it covers as separate things. Thin paint then becomes a real glaze, dry-brush tails look like paint on canvas, and bristles pick up pure paint, not the mix. Dried layers become the new ground for the next layer."


apparently what's left:
- Engine into the room. This is what the judges will see, and it's the biggest gap. As far as I can tell, the room still paints with the older gouache brush.
- Brush shapes. Round and filbert brushes, which also give you single dots.
- Friendlier controls. A few plain-language controls in place of the raw sliders.
- Deploy and demo script, plus the submission checklist.


3f3d5f8 - initial thoughts:
- it's back to the original setup which is great but feels like the canvas is a bit zoomed out. also, ideally it would be centered horizontally in the middle of the page, and probably birds-eye view on the desk along with the other items (like in real life.)
- also, lost some functionalities like save as png, see wetness etc (wetness one was cool but switching back and forth had some bugs before) + where is the settings adjust thing?
- btw why does the paint like run out so quick lmao

- ideas: shortcuts to change paint colour


f81990c: initial thoughts
- too many buttons in the sidebar and it doesn't look intentional. we need to do something about that for sure (hard to navigate and know quickly what to click next - potentially use the real estate on the right side?)




FEATURES next:
- ability to choose where the photos get hung up and stuff, be able to remove them and stuff - no backend soo yeah just a temporary room? since we're making art maybe there should be a backend but this is totally optional since they can save as png etc. i think depends on the storyline.


other notes + context from the photos
- want to be choosing colours from our own colour pallete we mix on, which for me was literally this old styrofoam meat tray where i'd just let the colours pile on. we can do the same thing here
- can use paintbrushes - the thick and long ones not detail oriented ones, also canvas for acrylic, and also painting knives. water cups too i guess
- tech: would be drawing on ipad right now but wacom is actually a great idea too because i have a wacom but it's not with me right now so i'll put that inside of what's next in devpost
- we should make the diorama more focused on the desk rather than the whole room. perhaps we can choose different rooms like the swiss alps, my waterloo room, my home room. there are photos for inspo - they are organized



todo later for design system
- implement dark
- fix one-off hard coded


test after deployment:
- undo only works once (both ipad and laptop)
- speed is normal on laptop (macbook pro, but heating up a lot) and it's very slow on my ipad. try to find ways to optimize... because speed is important and  yeah if i had my wacom with me this would be actually goated but yeah. 


notes after testing mixing palette on ipad:
- can we make it so that like it doesnt keep "selecting" things?

priorities (features, need to be knocked out quick, after deciding how i want them implemented)
- reference photo
- after the canvas, also need to like edit the diorama and make it better (potentially different options + night mode + MATCHES TIME IN THE DAYY yes that's an amazing idea actually!!!)
- ADD A CLOCK SOMEWHERE! real life ticking clock. could also add a 3d timer/alarm that you can use to keep track of how long you spent painting - everything in one place.
- LET'S NOT ADD TOO MANY THINGS THIS CLOSE TO SUBMISSION DEADLINE LOL!

- IMPORTANT: we should make the palette look like a real brown palette and allow user to choose where they put the colours..

- IMPORTANT: i feel like the experience on ipad is not the best!! would have been SO good if we actually like went with a wacom ahh i dont have it with me. but yeah we should genuinely see how we can improve the apple pencil experience (one thing: good that using finger doesn't draw, but it still produces like a cursor circle ykwim? so maybe we can remove that.)

- IMPORTANT: so for the birds-eye view, we should bascially like have the palette on the left side and actually be sitting on the table instead of having that additional white palette there if that makes sense. we want this to be as simple and realistic as possible!

- personal note: still totally fine with no backend.



PROMPT:
wait okay so the next largest thing we can do right now is to replace the circular paint colours with the tubes you already made. the idea is to have them all arranged in birds-eye view on the table  and when you hover, it says some metadata about the paint like colour, opacity and small sentence of what it's used for (i can provide this and make better later, u just include that feature for now). and then, have the real palette be interactive. because of this i think we should default to birds-eye-view instead of easel? go ahead and implement this if it makes sense, feel free to ask questions to clarify

was thinking if there's too many paints to put on the table at once we could have them sitting upright in a transparent container/box and then u can select which ones u want on the table? let me know what you think please!


post-prompt:
- firstly, this is what galerias actually look like - please make it match a little better
- next, can we make the little modal on the right side (with all the buttons and settings) be draggable
- please make the paint palette look like the standard type insteaf of the white. don't put it underneath the painting, we want the canvas to be centered and fairly large still. please move the modal further down, remove that window sill taking up so much room (it is looking a bit wrong in the zoom animation too) and use that space to put the water cups with brushes please.  then the palette can go on the left where the last row of paints are. then you can scatter the paints throughout empty space on the desk - perhaps with the primary colours together and other colours anywhere. don't line them up neatly, place them at angles.
- for the hover metadata tooltips, please make it more artistically technical and less conversational. include the small like square showing opacity and write the official name out clearly, make the background not full opacity

- also don't touch the readme i'm going to work on that in parallel in my own words and personality.



stuff for coding so i dont forget later
- make the trees look better
- edit the text and overall design, spend as much intentional time as possible tweaking layout (thinking through) and also edit the text and fonts to my desired styling.
- could also add more cards using the design system or use that to generate the assets instead of using canva (makes a lot more sense actually)


PROMPT:
- okay so bascially im trying to use this session to use this design system to generate some assets that i am using in my devpost and readme. nothing crazy, use these as inspiration for the amount of complexity vs simplicity. of course we should make it as visually appealing as possible, sticking to the theme of our app and yeah help me come up with some things? please ask me questions to clarify as well


some small things:
- when we are easel, maybe make it strictly like view mode, no painting.
- ai features to teach the art? or just a small playbook 
- btw those can be future features lmao. i actually wanan dev this but we got 3 hours rn so lock in!@

- can we make the palette a little bit bigger, then perhaps move the paints beneath the canvas to the left and right sides to fill the space, and make the canvas bigger

- also keyboard shortcuts maybe? like ctrl/cmd + something to change the brush for example or the size or undo... perhaps. still ofc it's supposed to be drawing first so yeah this might not be priority
- alsooo dedicated BOOKS on the desk - an art book and then an app tutorial!

- also  we should remove the lab html page soon.

