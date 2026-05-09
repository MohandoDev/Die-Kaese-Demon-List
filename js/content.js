import { round, score } from './score.js';

/**
 * Path to directory containing `_list.json` and all levels
 */
const dir = 'data';

export async function fetchList() {
    try {
        const listResult = await fetch(`${dir}/_list.json`);
        
        // Check if the list file actually exists
        if (!listResult.ok) throw new Error("Could not find _list.json");

        const list = await listResult.json();

        return await Promise.all(
            list.map(async (path, rank) => {
                try {
                    const levelResult = await fetch(`${dir}/${path}.json`);
                    
                    // Check if the level file exists
                    if (!levelResult.ok) throw new Error(`Level file ${path}.json not found`);

                    const level = await levelResult.json();

                    // Ensure level data and records exist before sorting
                    if (!level || !level.records) {
                        throw new Error(`Level ${path} has missing data or records`);
                    }

                    return [
                        {
                            ...level,
                            path,
                            records: level.records.sort(
                                (a, b) => b.percent - a.percent,
                            ),
                        },
                        null,
                    ];
                } catch (err) {
                    console.error(
                        `Failed to load level #${rank + 1} (${path}):`, err.message
                    );
                    return [null, path];
                }
            }),
        );
    } catch (err) {
        console.error(`Failed to load list:`, err.message);
        return null;
    }
}

export async function fetchEditors() {
    try {
        const editorsResults = await fetch(`${dir}/_editors.json`);
        if (!editorsResults.ok) return null;
        
        const editors = await editorsResults.json();
        return editors;
    } catch {
        return null;
    }
}

export async function fetchLeaderboard() {
    const listData = await fetchList();
    if (!listData) return [[], []]; // Return empty if list failed

    const scoreMap = {};
    const errs = [];

    listData.forEach(([level, err], rank) => {
        // If the level failed to load, skip logic and record the error
        if (err || !level) {
            errs.push(err || `Unknown error at rank ${rank + 1}`);
            return;
        }

        // Verification logic
        const verifier =
            Object.keys(scoreMap).find(
                (u) => u.toLowerCase() === level.verifier.toLowerCase(),
            ) || level.verifier;

        scoreMap[verifier] ??= {
            verified: [],
            completed: [],
            progressed: [],
        };

        const { verified } = scoreMap[verifier];

        verified.push({
            rank: rank + 1,
            level: level.name,
            score: score(rank + 1, 100, level.percentToQualify),
            link: level.verification,
        });

        // Records logic
        level.records.forEach((record) => {
            const user =
                Object.keys(scoreMap).find(
                    (u) => u.toLowerCase() === record.user.toLowerCase(),
                ) || record.user;

            scoreMap[user] ??= {
                verified: [],
                completed: [],
                progressed: [],
            };

            const { completed, progressed } = scoreMap[user];

            if (record.percent === 100) {
                completed.push({
                    rank: rank + 1,
                    level: level.name,
                    score: score(
                        rank + 1,
                        100,
                        level.percentToQualify,
                    ),
                    link: record.link,
                });
                return;
            }

            progressed.push({
                rank: rank + 1,
                level: level.name,
                percent: record.percent,
                score: score(
                    rank + 1,
                    record.percent,
                    level.percentToQualify,
                ),
                link: record.link,
            });
        });
    });

    // Wrap in extra Object containing the user and total score
    const res = Object.entries(scoreMap).map(([user, scores]) => {
        const { verified, completed, progressed } = scores;

        const total = [verified, completed, progressed]
            .flat()
            .reduce((prev, cur) => prev + cur.score, 0);

        return {
            user,
            total: round(total),
            ...scores,
        };
    });

    // Sort by total score
    return [res.sort((a, b) => b.total - a.total), errs];
}
