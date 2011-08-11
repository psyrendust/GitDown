## About

AirMarkdown is an Air application that provides a simulated live preview of <a href="http://github.github.com/github-flavored-markdown/" target="_blank">GitHub Flavored Markdown</a>.

## Usage

#### Open
To open a markdown formatted document click on the <a class="file-edit-link minibutton"><span>Select Markdown File</span></a> button.

#### Refresh
To view changes that you have made to your document click on the <a class="file-edit-link minibutton"><span>Refresh</span></a> button. A document refresh will also occur when AirMarkdown regains application focus.

#### Markdown Cheat Sheet
To view a cheat sheet of markdown syntax click on the <a class="file-edit-link minibutton"><span>Markdown Cheat Sheet</span></a> button.

## Acknowledgement</h2>
The styling for this application is modeled after <a href="https://github.com" target="_blank">GitHub's</a> UI. The Markdown Cheat Sheet is taken from <a href="http://github.github.com/github-flavored-markdown/" target="_blank">GitHub's MCS</a>. The markdown processing is handled by <a href="https://github.com/tanoku" target="_blank">tanoku's</a> javascript translation of Upskirt called <a href="https://github.com/tanoku/jsupskirt" target="_blank">jsupskirt</a>. Unfortunately all references to the Upskirt library have been removed from <a href="https://github.com" target="_blank">GitHub</a>.

## License
![Creative Commons](http://i.creativecommons.org/l/by-nc-sa/3.0/80x15.png)

This work is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License. To view a copy of this license, visit <a href="http://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank">http://creativecommons.org/licenses/by-nc-sa/3.0/</a> or send a letter to Creative Commons, 444 Castro Street, Suite 900, Mountain View, California, 94041, USA.

## Known Bugs
If a link is clicked where the target is set to self, the apps window will redirect to that web page. Currently there are no controls to reset the app window. You will have to restart the app to exit out of this scenario.

***

In this implementation of jsupskirt the parsing of the following markdown syntax is not supported and will break the rendering.

##### Use of multiple Grave accents to encapsulate code blocks is not supported.

    ```
    function foo(){
    return "bar";
    }
    ```

##### Use of multiple Grave accents with language type to encapsulate code blocks is not supported.

    ```javascript
    function foo(){
    return "bar";
    }
    ```

##### Use of <code>&lt;pre&gt;</code> tags is not supported.

    <pre>
    function foo(){
    return "bar";
    }
    </pre>

##### Use of <code>&lt;code&gt;</code> tags is not supported.

    <code>
    function foo(){
    return "bar";
    }
    </code>
