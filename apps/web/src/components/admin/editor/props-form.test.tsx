// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PropFieldsForm } from './props-form';
import { PROP_FIELDS, defaultProps } from './prop-fields';
const me={id:'editor',email:'editor@example.invalid',name:'Synthetic editor',roleKey:'content_editor',locale:'en',permissions:[]};
afterEach(cleanup);
for(const locale of ['ar','en'] as const)describe(`property controls ${locale}`,()=>{
 for(const type of Object.keys(PROP_FIELDS) as Array<keyof typeof PROP_FIELDS>)it(`${type}: every rendered control has a unique DOM identity`,()=>{
  const {container}=render(<PropFieldsForm fields={PROP_FIELDS[type]} value={defaultProps(type)} onChange={()=>{}} locale={locale} me={me}/>);
  const ids=Array.from(container.querySelectorAll('[id]')).map(e=>e.id);
  expect(ids.filter((id,i)=>ids.indexOf(id)!==i)).toEqual([]);
 });
 it('clicking the second nested label focuses and edits only its own item',async()=>{
  const user=userEvent.setup();
  function Harness(){const [value,setValue]=useState<Record<string,unknown>>({title:'Outer',items:[{title:'First',body:'One'},{title:'Second',body:'Two'}]});return <><PropFieldsForm fields={PROP_FIELDS.featureGrid} value={value} onChange={setValue} locale={locale} me={me}/><output data-testid="values">{JSON.stringify(value)}</output></>;}
  const {container}=render(<Harness/>);
  const target=screen.getByDisplayValue('Second');
  const label=target.parentElement!.querySelector('label')!;
  await user.click(label);expect(target).toHaveFocus();
  await user.keyboard('{Control>}a{/Control}Changed');
  const result=JSON.parse(screen.getByTestId('values').textContent!);
  expect(result.title).toBe('Outer');expect(result.items[0].title).toBe('First');expect(result.items[1].title).toBe('Changed');
  expect(container.querySelectorAll('input')).not.toHaveLength(0);
 });
});
