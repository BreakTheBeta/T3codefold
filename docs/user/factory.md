# Factory preview

Factory coordinates a Commander, Subcommanders and Workers in each connected environment. Open **Factory** above the thread list in web or desktop, select an environment and choose the Commander's model before starting it. The mobile Factory inbox opens from the same place; start the Commander from web or desktop first.

Decision cards explain the work, why your input is needed and the cost of waiting. Choosing an option stages it locally. **Send** submits the answer. You can take the recommendation with **Defer to agent**, add a note, or write your own direction. If an agent changes the card before you answer, reload the current revision. Outward-action cards display their exact payload and hash; mobile requires enrolled biometrics before submitting an answer to these cards.

Factory action tools require user approval bound to the action they execute. Agents are instructed to use those tools for opening or merging pull requests, force-pushes, branch deletion and external posts. Direct provider shells, other tools and script effects can bypass this workflow. This v1 approval boundary applies to Factory action tools and is not a sandbox around every provider command. An unknown action result needs verification on the external host before authorising a new action.

Use **Checks** to inspect checks and shadow results, and **Fleet** to inspect agents and command jobs. Cancelling a running job requests termination; the job stays under supervision until its termination is confirmed.

This preview is under development. Commander handover, notification delivery and several recovery paths are still being completed. Upgrading to it removes the retired GLaDOS records; reverting the code does not restore that data.
