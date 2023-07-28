/**
 * @license Copyright (c) 2003-2023, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

import ModelTestEditor from '@ckeditor/ckeditor5-core/tests/_utils/modeltesteditor';
import { setData, getData } from '@ckeditor/ckeditor5-engine/src/dev-utils/model';
import FindAndReplaceEditing from '../src/findandreplaceediting';
import Paragraph from '@ckeditor/ckeditor5-paragraph/src/paragraph';
import BoldEditing from '@ckeditor/ckeditor5-basic-styles/src/bold/boldediting';
import UndoEditing from '@ckeditor/ckeditor5-undo/src/undoediting';

import { uid, Collection } from 'ckeditor5/src/utils';

describe( 'ReplaceAllCommand', () => {
	let editor, model, command;

	beforeEach( () => {
		return ModelTestEditor
			.create( {
				plugins: [ FindAndReplaceEditing, Paragraph, BoldEditing, UndoEditing ]
			} )
			.then( newEditor => {
				editor = newEditor;
				model = editor.model;
				command = editor.commands.get( 'replaceAll' );
			} );
	} );

	afterEach( () => {
		return editor.destroy();
	} );

	describe( 'isEnabled', () => {
		it( 'should be enabled in empty document', () => {
			setData( model, '[]' );
			expect( command.isEnabled ).to.be.true;
		} );

		it( 'should be enabled by default', () => {
			setData( model, '<paragraph>foo[]</paragraph>' );
			expect( command.isEnabled ).to.be.true;
		} );
	} );

	describe( 'state', () => {
		it( 'is set to plugin\'s state', () => {
			expect( command._state ).to.equal( editor.plugins.get( 'FindAndReplaceEditing' ).state );
		} );
	} );

	describe( 'execute()', () => {
		it( 'should replace all text occurrences in the document', () => {
			setData( model, '<paragraph>Foo bar baz</paragraph><paragraph>Foo bar baz</paragraph>' );

			editor.execute( 'replaceAll', 'new', 'bar' );

			expect( editor.getData() ).to.equal( '<p>Foo new baz</p><p>Foo new baz</p>' );
		} );

		it( 'should not change model if nothing was matched', () => {
			setData( model, '<paragraph>Foo bar baz</paragraph><paragraph>Foo bar baz</paragraph>' );

			editor.execute( 'replaceAll', 'new', 'baar' );

			expect( editor.getData() ).to.equal( '<p>Foo bar baz</p><p>Foo bar baz</p>' );
		} );

		it( 'should replace all passed results in the document', () => {
			setData( model, '<paragraph>Foo bar [b]az</paragraph><paragraph>[Foo] bar baz</paragraph>' );

			const ranges = editor.model.document.selection.getRanges();
			const results = new Collection();

			model.change( writer => {
				for ( const range of ranges ) {
					const id = uid();

					results.add( {
						id,
						label: 'label',
						marker: writer.addMarker( id, {
							usingOperation: false,
							affectsData: false,
							range
						} )
					} );
				}
			} );

			editor.execute( 'replaceAll', 'new', results );

			expect( editor.getData() ).to.equal( '<p>Foo bar newaz</p><p>new bar baz</p>' );
		} );

		it( 'should work with empty document', () => {
			setData( model, '' );

			editor.execute( 'replaceAll', 'new', 'bar' );

			expect( editor.getData() ).to.equal( '' );
		} );

		it( 'should replace all occurrences in multiple roots', async () => {
			class MultiRootEditor extends ModelTestEditor {
				constructor( config ) {
					super( config );

					this.model.document.createRoot( '$root', 'second' );
				}
			}

			const multiRootEditor = await MultiRootEditor
				.create( { plugins: [ FindAndReplaceEditing, Paragraph ] } );

			setData( multiRootEditor.model, '<paragraph>Foo bar baz</paragraph>' );
			setData( multiRootEditor.model, '<paragraph>Foo bar baz</paragraph>', { rootName: 'second' } );

			const { results } = multiRootEditor.execute( 'find', 'z' );

			multiRootEditor.execute( 'replaceAll', 'r', results );

			expect( multiRootEditor.getData() ).to.equal( '<p>Foo bar bar</p>' );
			expect( multiRootEditor.getData( { rootName: 'second' } ) ).to.equal( '<p>Foo bar bar</p>' );

			await multiRootEditor.destroy();
		} );

		it( 'should not replace find results that landed in the $graveyard root (e.g. removed by collaborators)', () => {
			setData( model, '<paragraph>Aoo Boo Coo Doo</paragraph>' );

			const { results } = editor.execute( 'find', 'oo' );

			model.change( writer => {
				writer.remove(
					// <paragraph>Aoo [Boo Coo] Doo</paragraph>
					model.createRange(
						model.createPositionAt( model.document.getRoot().getChild( 0 ), 4 ),
						model.createPositionAt( model.document.getRoot().getChild( 0 ), 11 )
					)
				);
			} );

			// Wrap this call in the transparent batch to make it easier to undo the above deletion only.
			// In real life scenario the above deletion would be a transparent batch from the remote user,
			// and undo would also be triggered by the remote user.
			model.enqueueChange( { isUndoable: false }, () => {
				editor.execute( 'replaceAll', 'aa', results );
			} );

			expect( getData( editor.model, { withoutSelection: true } ) ).to.equal( '<paragraph>Aaa  Daa</paragraph>' );

			editor.execute( 'undo' );

			expect( getData( editor.model, { withoutSelection: true } ) ).to.equal( '<paragraph>Aaa Boo Coo Daa</paragraph>' );
		} );

		it( 'should one undo step restore every text occurrences replaced by `replace all` in the document at once.', () => {
			setData( model, '<paragraph>Foo bar baz</paragraph><paragraph>Foo bar baz</paragraph><paragraph>Foo bar baz</paragraph>' );

			editor.execute( 'replaceAll', 'new', 'bar' );

			expect( editor.getData() ).to.equal( '<p>Foo new baz</p><p>Foo new baz</p><p>Foo new baz</p>' );

			editor.execute( 'undo' );

			expect( editor.getData() ).to.equal( '<p>Foo bar baz</p><p>Foo bar baz</p><p>Foo bar baz</p>' );
		} );

		it( 'should one undo step restore every text occurrences replaced by `replace all` in multiple roots at once.', async () => {
			class MultiRootEditor extends ModelTestEditor {
				constructor( config ) {
					super( config );

					this.model.document.createRoot( '$root', 'second' );
				}
			}

			const multiRootEditor = await MultiRootEditor
				.create( { plugins: [ FindAndReplaceEditing, Paragraph, UndoEditing ] } );

			setData( multiRootEditor.model, '<paragraph>Foo bar baz</paragraph>' );
			setData( multiRootEditor.model, '<paragraph>Foo bar baz</paragraph>', { rootName: 'second' } );

			const { results } = multiRootEditor.execute( 'find', 'z' );

			multiRootEditor.execute( 'replaceAll', 'r', results );

			expect( multiRootEditor.getData() ).to.equal( '<p>Foo bar bar</p>' );
			expect( multiRootEditor.getData( { rootName: 'second' } ) ).to.equal( '<p>Foo bar bar</p>' );

			multiRootEditor.execute( 'undo' );

			expect( multiRootEditor.getData() ).to.equal( '<p>Foo bar baz</p>' );
			expect( multiRootEditor.getData( { rootName: 'second' } ) ).to.equal( '<p>Foo bar baz</p>' );

			await multiRootEditor.destroy();
		} );
	} );
} );
