import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeamSelect, { TEAM_CHOICES } from '../TeamSelect';

// The optional Team field of the add and edit student dialogs (the sponsor's answer, CICD-79): "No team
// assigned", Team 1 to Team 10, and "+ Add another
// team", which adds the next numbered team (Team 11, Team 12, ...) to the list and picks it. Like the
// dialogs, it holds no form state: the page passes the team name and gets the new one back, so a small
// wrapper plays the page.
const user = userEvent.setup({ delay: null });

function Page({ initial = '', existingTeams, onValue = () => {} }) {
  const [value, setValue] = useState(initial);
  return <TeamSelect value={value} existingTeams={existingTeams} onChange={(next) => { setValue(next); onValue(next); }} />;
}

const field = () => screen.getByRole('combobox', { name: /Team Assignment/ });
const optionNames = () => screen.getAllByRole('option').map((option) => option.textContent);
const open = () => user.click(field());
const choose = async (name) => {
  await open();
  await user.click(screen.getByRole('option', { name }));
};
const ADD = '+ Add another team';
const NO_TEAM = 'No team assigned';

describe('TeamSelect', () => {
  test('lists No team assigned, Team 1 to Team 10 and ends with + Add another team', async () => {
    render(<Page />);
    await open();

    expect(TEAM_CHOICES).toHaveLength(10);
    expect(optionNames()).toEqual([NO_TEAM, ...TEAM_CHOICES, ADD]);
    expect(optionNames()[0]).toBe(NO_TEAM);
    expect(optionNames()[1]).toBe('Team 1');
    expect(optionNames()[10]).toBe('Team 10');
  });

  test('is optional: with nothing chosen it says "No team assigned", and a small alert says what that means', () => {
    render(<Page />);
    expect(field()).not.toBeRequired();
    expect(field()).toHaveTextContent(NO_TEAM);
    expect(screen.getByRole('alert')).toHaveTextContent(/No team assigned/);
    expect(screen.getByRole('alert')).toHaveTextContent(/will not be sent an evaluation until you assign a team/);
  });

  test('the alert goes away when a team is chosen, and comes back when "No team assigned" is chosen again', async () => {
    const onValue = vi.fn();
    render(<Page onValue={onValue} />);

    await choose('Team 3');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await choose(NO_TEAM);
    expect(onValue).toHaveBeenLastCalledWith('');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(field()).toHaveTextContent(NO_TEAM);
  });

  test('a student who already has a team shows it and no alert', () => {
    render(<Page initial="Team 2" />);
    expect(field()).toHaveTextContent('Team 2');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('choosing a team passes its name to the page', async () => {
    const onValue = vi.fn();
    render(<Page onValue={onValue} />);

    await choose('Team 3');

    expect(onValue).toHaveBeenLastCalledWith('Team 3');
    expect(field()).toHaveTextContent('Team 3');
  });

  test('+ Add another team adds Team 11 to the list and picks it', async () => {
    const onValue = vi.fn();
    render(<Page onValue={onValue} />);

    await choose(ADD);

    expect(onValue).toHaveBeenLastCalledWith('Team 11');
    expect(field()).toHaveTextContent('Team 11');
    await open();
    expect(optionNames()).toEqual([NO_TEAM, ...TEAM_CHOICES, 'Team 11', ADD]);
  });

  test('every further click adds the next number', async () => {
    const onValue = vi.fn();
    render(<Page onValue={onValue} />);

    await choose(ADD);
    await choose(ADD);
    await choose(ADD);

    expect(onValue.mock.calls.map(([name]) => name)).toEqual(['Team 11', 'Team 12', 'Team 13']);
    expect(field()).toHaveTextContent('Team 13');
    await open();
    expect(optionNames()).toEqual([NO_TEAM, ...TEAM_CHOICES, 'Team 11', 'Team 12', 'Team 13', ADD]);
  });

  test('an added team stays in the list after another team is chosen, and can be chosen back', async () => {
    render(<Page />);
    await choose(ADD);
    await choose('Team 2');

    await choose('Team 11');

    expect(field()).toHaveTextContent('Team 11');
  });

  test('the page never gets the "+ Add another team" item as a team name', async () => {
    const onValue = vi.fn();
    render(<Page onValue={onValue} />);

    await choose(ADD);
    await choose(ADD);

    expect(onValue.mock.calls.map(([name]) => name).join(' ')).not.toMatch(/add/i);
  });

  test('numbered teams the course already has beyond Team 10 are in the list, and the numbering goes on from them', async () => {
    const onValue = vi.fn();
    // Other names (Group A, Team A) and odd spellings are not part of the numbered list.
    render(<Page existingTeams={['Team 12', 'Group A', 'Team 11', 'Team A', 'Team 011', 'Team 12', 'Team 4']} onValue={onValue} />);
    await open();
    expect(optionNames()).toEqual([NO_TEAM, ...TEAM_CHOICES, 'Team 11', 'Team 12', ADD]);

    await user.click(screen.getByRole('option', { name: ADD }));

    expect(onValue).toHaveBeenLastCalledWith('Team 13');
  });

  test('a team that is not in the list (the student\'s current one) is shown and can be picked', async () => {
    render(<Page initial="Group A" />);
    expect(field()).toHaveTextContent('Group A');

    await open();
    // After the numbered teams, before the add-another item.
    expect(optionNames()).toEqual([NO_TEAM, ...TEAM_CHOICES, 'Group A', ADD]);
  });

  test('the student\'s current team stays in the list after another team is chosen, so it can be chosen back', async () => {
    render(<Page initial="Group A" />);

    await choose('Team 4');
    await open();
    expect(optionNames()).toEqual([NO_TEAM, ...TEAM_CHOICES, 'Group A', ADD]);
    await user.click(screen.getByRole('option', { name: 'Group A' }));

    expect(field()).toHaveTextContent('Group A');
  });

  test('a current team numbered beyond Team 10 counts for the numbering', async () => {
    const onValue = vi.fn();
    render(<Page initial="Team 15" onValue={onValue} />);

    await choose(ADD);

    expect(onValue).toHaveBeenLastCalledWith('Team 16');
  });
});
