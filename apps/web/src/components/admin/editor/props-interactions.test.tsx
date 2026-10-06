// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {useState} from 'react';
import {PropFieldsForm} from './props-form';
import {PROP_FIELDS,type FieldDef} from './prop-fields';
import {getPortalContent} from '@/content/portal';
const me={id:'editor',email:'editor@example.invalid',name:'Synthetic',roleKey:'content_editor',locale:'en',permissions:[]};
afterEach(cleanup);
function Harness({field,initial,locale}:{field:FieldDef;initial:unknown;locale:'ar'|'en'}){
 const [value,setValue]=useState<Record<string,unknown>>({[field.key]:initial,untouched:'sentinel'});
 return <><PropFieldsForm fields={[field]} value={value} onChange={setValue} locale={locale} me={me}/><output data-testid="state">{JSON.stringify(value)}</output></>;
}
function state(){const value=JSON.parse(screen.getByTestId('state').textContent!);expect(value.untouched).toBe('sentinel');return value;}
function flatten(fields:FieldDef[],path=''):Array<{field:FieldDef;path:string}>{return fields.flatMap(field=>[{field,path:path+field.key},...flatten(field.itemFields??[],path+field.key+'.')]);}
for(const locale of ['ar','en'] as const)for(const [type,fields] of Object.entries(PROP_FIELDS))for(const {field,path} of flatten(fields)){
 it(`${locale} ${type}.${path}: edits ${field.type} without changing sibling values`,()=>{
  const te=getPortalContent(locale).admin.editor;
  if(['text','textarea','media','number','switch','select'].includes(field.type)){
   const initial=field.type==='number'?4:field.type==='switch'?false:field.type==='select'?(field.numeric?Number(field.options![0].value):field.options![0].value):'Before';
   const {container}=render(<Harness field={field} initial={initial} locale={locale}/>);
   if(field.type==='select'){
    // Radix keyboard selection exercises the real numeric/string conversion.
    const control=screen.getByRole('combobox');fireEvent.keyDown(control,{key:'Enter'});
    const option=field.options!.at(-1)!;fireEvent.click(screen.getByRole('option',{name:option.label[locale]}));
    expect(state()[field.key]).toBe(field.numeric?Number(option.value):option.value);
    if(field.optional){fireEvent.keyDown(control,{key:'Enter'});fireEvent.click(screen.getByRole('option',{name:/none|بدون/}));expect(state()).not.toHaveProperty(field.key);}
   }else if(field.type==='switch'){fireEvent.click(screen.getByRole('switch'));expect(state()[field.key]).toBe(true);}
   else {const control=container.querySelector('input,textarea')!;fireEvent.change(control,{target:{value:field.type==='number'?'12.9':'Changed نص'}});expect(state()[field.key]).toBe(field.type==='number'?12:'Changed نص');if(field.type==='number'){fireEvent.change(control,{target:{value:''}});expect(state()).not.toHaveProperty(field.key);}}
  }else if(field.type==='array'||field.type==='stringlist'){
   const first=field.type==='array'?{marker:'first'}:'First',second=field.type==='array'?{marker:'second'}:'Second';
   render(<Harness field={field} initial={[first,second]} locale={locale}/>);
   expect(screen.getAllByRole('button',{name:te.moveUp})[0]).toBeDisabled();
   fireEvent.click(screen.getAllByRole('button',{name:te.moveDown})[0]);expect(state()[field.key].slice(0,2)).toEqual([second,first]);
   fireEvent.click(screen.getAllByRole('button',{name:te.removeItem})[0]);expect(state()[field.key]).toEqual([first]);
   fireEvent.click(screen.getAllByRole('button',{name:te.addItem}).at(-1)!);expect(state()[field.key]).toHaveLength(2);
  }else if(field.type==='group'){
   render(<Harness field={field} initial={field.optional?{}:{[field.itemFields![0].key]:'Before'}} locale={locale}/>);
   if(field.optional)fireEvent.click(screen.getByRole('button',{name:te.addItem}));
   expect(Object.keys(state()[field.key])).toContain(field.itemFields![0].key);
  }else if(field.type==='rows'){
   render(<Harness field={field} initial={[["First"],["Second"]]} locale={locale}/>);
   fireEvent.change(screen.getAllByRole('textbox')[0],{target:{value:'Cell نص'}});expect(state()[field.key][0][0]).toBe('Cell نص');
   fireEvent.click(screen.getAllByRole('button',{name:te.moveDown})[0]);expect(state()[field.key]).toEqual([['Second'],['Cell نص']]);
   fireEvent.click(screen.getAllByRole('button',{name:te.addItem})[0]);expect(state()[field.key][0]).toEqual(['Second','']);
   fireEvent.click(screen.getAllByRole('button',{name:te.removeItem})[2]);expect(state()[field.key][0]).toEqual(['Second']);
   fireEvent.click(screen.getAllByRole('button',{name:te.removeItem})[0]);expect(state()[field.key]).toEqual([['Cell نص']]);
  }
 });
}
