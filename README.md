# Piano

A piano practice dashboard for tempo, ear training, and sight reading, with a practice log.

Live: https://dong-xuyong.github.io/piano/

Log practice: https://dong-xuyong.github.io/piano/#/log

Data lives in Dong-Xuyong/progress-sync, file piano.json.

The page auto-loads that file on open, when the tab becomes visible, and every 60 seconds. The log screen writes practice entries back to the same file. A day's minutes stay equal to the sum of its entries, so the streak and the heatmap keep working.

With no GitHub token the page shows demo data and never saves.

CONTRACT.md is the writer spec for updating piano.json.
