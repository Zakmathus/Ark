class DataTableEditor {
    constructor(options) {
        // Configuración de la API y el SP
        this.apiUrl = options.apiUrl;                // URL del API
        this.spName = options.spName;                // Nombre del stored procedure
        this.schemaColumns = options.schemaColumns;  // Cadena con los campos: 'item,whF,locationF,QtyBag,Verificada,RegDate'
        this.tableName = options.tableName; // Nueva propiedad para nombre de tabla
        this.containerId = options.containerId;      // id del div que se usará para renderizar la tabla
        this.container = document.getElementById(this.containerId);
        this.customClass = options.customClass || ''; // Clase CSS opcional
        if (!this.container) {
            console.error(`Contenedor con el id ${this.containerId} no fue encontrado.`);
            return;
        }
        // ... otras asignaciones ...
        this.selectFields = options.selectFields || {}; // almacena, por ejemplo, { item: { columnsToInclude: 'item' } }
        // Generar un identificador único para la tabla:
        this.tableId = 'userTable-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        this.columns = [];  // Se llenará con el esquema obtenido
        this.records = [];  // Se llenará con los datos (registros)
        this.init();
    }

    init() {

        // Contenedor donde se renderizará la tabla
        this.tableContainer = document.createElement('div');
        this.container.appendChild(this.tableContainer);
        // Inicia obteniendo el esquema, que a su vez llama a fetchRecords()
        this.fetchSchema();
        // Obtiene las opciones para campos que se van a renderizar como select.
        // Por ejemplo, para cada campo definido en selectFields:
        if (this.selectFields.hasOwnProperty('item')) {
             this.fetchSelectOptions();
        }
        // Luego, traer registros:
        this.fetchRecords();
    }

    // Método para determinar el tipo de input según el tipo de dato del esquema
    getInputType(dataType) {
        const type = dataType.toLowerCase();
        if (type.includes("int") || type.includes("float") || type.includes("decimal") || type.includes("numeric")) return 'number';
        if (type.includes("date") || type.includes("datetime")) return 'date';
        if (type.includes("bit")) return 'checkbox'; // Tipo para valores booleanos
        return 'text'; // Por defecto, para varchar y otros tipos
    }

    // Esta función hace la petición a la API y obtiene la respuesta en texto (HTML)
    async apiCalljson(kind, parameters) {
        const payload = {
            'Name': this.procedureName,
            'Parameters': {
                '@kind': kind,
                ...parameters
            }
        };

        const request = new Request(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        try {
            const response = await fetch(request);
            const resultJson = await response.json();
            return resultJson;
        } catch (error) {
            console.error("Error en la API:", error);
            return null;
        }
    }

    // Función que convierte una tabla HTML a un array de objetos JSON.
    // Se asume que la tabla tiene una fila de encabezados.
    tableToJson(table) {
        const data = [];
        let headers = [];
        // Buscar el thead; si no existe, se toma la primera fila del tbody
        const thead = table.querySelector('thead');
        if (thead) {
            headers = Array.from(thead.querySelectorAll('th')).map(th => th.textContent.trim());
        } else {
            const firstRow = table.querySelector('tbody tr');
            if (firstRow) {
                headers = Array.from(firstRow.querySelectorAll('td')).map(td => td.textContent.trim());
            }
        }
        // Seleccionar todas las filas de datos
        const rows = table.querySelectorAll('tbody tr');
        // Si no existe thead, se asume que la primera fila es de encabezados y se salta
        let startIndex = thead ? 0 : 1;
        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            const cells = row.querySelectorAll('td');
            let rowData = {};
            cells.forEach((cell, index) => {
                rowData[headers[index] || ('col' + index)] = cell.textContent.trim();
            });
            data.push(rowData);
        }
        return data;
    }

    // Función que llama a la API con @kind = 1, parsea el HTML, extrae ambas tablas (datos y esquema) y las convierte a JSON
    async fetchSchema() {
        /*
          Llama a la API (kind = 5) para obtener el esquema de la tabla de acuerdo a los campos especificados.
          - Se utiliza la propiedad schemaColumns y el SP definido (spName).
          - Una vez obtenido el esquema, se mapea para crear un arreglo de columnas y se guardan internamente.
        */
        const schemaJson = await this.apiCallJson(5, { columnsToInclude: this.schemaColumns, tableName: this.tableName });
        console.log("Esquema filtrado:", schemaJson);

        if (schemaJson) {
            this.columns = schemaJson.map(col => ({
                field: col.ColumnName,
                label: col.ColumnName,
                type: col.DataType
            }));
            // Llama a la función para traer los registros, pasando la misma lista de columnas.
            this.fetchRecords();
        } else {
            console.error("No se pudo obtener el esquema.");
        }
    }

    async fetchRecords() {
        /* 
          Llama a la API (kind = 1) para traer los registros.
          El parámetro columnsToInclude se utiliza para que el SP solo retorne aquellos campos definidos.
        */
        const dataJson = await this.apiCallJson(1, { columnsToInclude: this.schemaColumns, tableName: this.tableName });
        console.log("Registros obtenidos:", dataJson);
        if (dataJson) {
            this.records = dataJson;
            this.renderTable();
        } else {
            console.error("No se pudieron obtener los registros.");
        }
    }

    // Función para mapear el tipo de dato SQL a un input HTML adecuado
    getInputType(dataType) {
        const type = dataType.toLowerCase();
        if (type.includes("int") || type.includes("float") || type.includes("decimal") || type.includes("numeric"))
            return 'number';
        if (type.includes("datetime"))
            return 'datetime-local';
        if (type.includes("date"))
            return 'date';
        if (type.includes("bit"))
            return 'checkbox';
        return 'text';
    }

    // Renderiza la tabla HTML basada en this.records y this.columns
    renderTable() {
        // Destruye la instancia previa de DataTables si existe
        if ($.fn.DataTable.isDataTable(`#${this.tableId}`)) {
            $(`#${this.tableId}`).DataTable().destroy();
        }

        // Limpia el contenedor y genera la tabla dinámica
        this.tableContainer.innerHTML = `
        <button id="addButton-${this.tableId}">Agregar Nuevo</button>
        <div style="width: 100%; border: 1px solid #ddd; padding: 10px;">
            <table id="${this.tableId}" class="display ${this.customClass}" style="width:100%">
            <thead style="position: sticky;top: 0;">
                <tr>
                ${this.columns.map(col => `<th>${col.label}</th>`).join('')}
                <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                 ${this.records.map(record => {
                     const row = this.columns.map(col => {
                         let cellValue = record[col.field] ?? '';
                         // Si el tipo de dato se asigna como 'datetime-local', se formatea para mostrar
                         if (this.getInputType(col.type) === 'datetime-local' && cellValue) {
                             cellValue = formatDateForDisplay(cellValue);
                         }
                         return `<td>${cellValue}</td>`;
                     }).join('');

                const actions = `
                    <td>
                    <button class="edit-button" data-id="${record.id}">Editar</button>
                    <button class="delete-button" data-id="${record.id}">Eliminar</button>
                    </td>
                `;
                return `<tr data-id="${record.id}">${row}${actions}</tr>`;
            }).join('')}
            </tbody>
            </table>
        </div>
        `;

        
        $(`#${this.tableId}`).DataTable({
            pageLength: 10,
            lengthMenu: [5, 10, 25, 50],
            language: {
                url: "https://cdn.datatables.net/plug-ins/1.13.4/i18n/es-MX.json"
            }
        });

        // Agrega eventos a los botones de editar y eliminar
        document.querySelectorAll('.edit-button').forEach(button => {
            button.addEventListener('click', (event) => this.handleEdit(event, button.dataset.id));
        });
        document.querySelectorAll('.delete-button').forEach(button => {
            button.addEventListener('click', (event) => this.handleDelete(event, button.dataset.id));
        });

        // Evento para agregar nueva fila
        document.getElementById(`addButton-${this.tableId}`).addEventListener('click', () => this.handleAdd());
        
    }


    handleAdd() {
        // Deshabilita el botón "Agregar Nuevo" para evitar múltiples clics.
        const addButton = document.getElementById(`addButton-${this.tableId}`);
        addButton.disabled = true;

        // Crea una nueva fila donde se insertarán inputs/selects para cada columna.
        const newRow = document.createElement('tr');

        // Itera sobre cada columna definida en el esquema.
        this.columns.forEach(col => {
            const cell = document.createElement('td');
            let elementHtml = '';
            if (col.field.toLowerCase() === 'id') {
                elementHtml = `<input type="text" name="${col.field}" value="" style="width:100%;" readonly />`;
            } else {
                // Si el campo está configurado en selectFields, lo renderizamos como <select>
                if (this.selectFields && this.selectFields.hasOwnProperty(col.field.toLowerCase())) {
                    // Verifica que ya se hayan precargado las opciones para este campo.
                    if (this.selectOptions && this.selectOptions[col.field.toLowerCase()]) {
                        let selectHTML = `<select name="${col.field}" style="width:100%;">`;
                        // Se itera sobre las opciones disponibles. Se espera que cada opción tenga { value, text }
                        let options = this.selectOptions[col.field.toLowerCase()];
                        options.forEach(opt => {
                            selectHTML += `<option value="${opt.value}">${opt.text}</option>`;
                        });
                        selectHTML += `</select>`;
                        elementHtml = selectHTML;
                    } else {
                        // Si no se han cargado las opciones, se usa un input de fallback.
                        elementHtml = `<input type="text" name="${col.field}" style="width:100%;" value="" />`;
                    }
                } else {
                    // Si el campo no está configurado como select, renderizamos según su tipo.
                    const inputType = this.getInputType(col.type);
                    if (inputType === 'datetime-local') {
                        let now = new Date();
                        let formattedNow = now.toISOString().split('.')[0];
                        elementHtml = `<input type="${inputType}" name="${col.field}" value="${formattedNow}" style="width:100%;" step="1" />`;
                    } else if (inputType === 'checkbox') {
                        elementHtml = `<input type="${inputType}" name="${col.field}" style="width:100%;" />`;
                    } else {
                        elementHtml = `<input type="${inputType}" name="${col.field}" value="" style="width:100%;" />`;
                    }
                }
            }

            cell.innerHTML = elementHtml;
            newRow.appendChild(cell);
        });

        // Crea la celda adicional para las acciones (Guardar/Cancelar)
        const actionsCell = document.createElement('td');
        actionsCell.innerHTML = `
            <button class="save-new-button">Guardar</button>
            <button class="cancel-new-button">Cancelar</button>
          `;
        newRow.appendChild(actionsCell);

        // Inserta la nueva fila al principio del tbody de la tabla existente.
        const tbody = document.querySelector(`#${this.tableId} tbody`);
        if (tbody) {
            tbody.prepend(newRow);
        } else {
            console.error("No se encontró el tbody de la tabla.");
        }

        // Asigna eventos a los botones de Guardar y Cancelar de la nueva fila.
        actionsCell.querySelector('.save-new-button').addEventListener('click', () => this.saveNewRecord(newRow));
        actionsCell.querySelector('.cancel-new-button').addEventListener('click', () => {
            newRow.remove();
            addButton.disabled = false;
        });
    }


    saveNewRecord(row) {
        const updatedFields = []; // Lista de nombres de campos a insertar
        const updatedValues = []; // Lista de valores correspondientes

        // Se recorre cada columna definida en el esquema
        this.columns.forEach((col, index) => {
            // Omitir la columna autoincrementable Id
            if (col.field.toLowerCase() === 'id') {
                return; // Salta esta iteración
            }
            const cell = row.children[index];
            const input = cell.querySelector('input, select');
            updatedFields.push(col.field);

            if (!input) {
                updatedValues.push('');
            } else if (input.type === 'checkbox') {
                updatedValues.push(input.checked);
            } else if (input.type === 'datetime-local') {
                // Si el control es datetime-local, se convierte el formato de "YYYY-MM-DDTHH:MM:SS" a "YYYY-MM-DD HH:MM:SS"
                updatedValues.push(input.value.replace('T', ' '));
            } else {
                updatedValues.push(input.value);
            }
        });

        // Se convierten los arrays a cadenas separadas por comas
        const fieldsString = updatedFields.join(',');
        const valuesString = updatedValues.map(val => `'${val}'`).join(',');

        // Llamada a la API para insertar (kind = 2)
        this.apiCallJson(2, { columnsToInclude: fieldsString, values: valuesString, tableName: this.tableName })
            .then(result => {
                if (result && result[0]?.success === 1) {
                    alert("Registro agregado con éxito");
                    this.fetchRecords(); // Actualiza la tabla correctamente
                } else {
                    alert("Error al agregar el registro");
                }
            })
            .catch(error => {
                console.error("Error en la solicitud:", error);
            })
            .finally(() => {
                // Habilita nuevamente el botón "Agregar Nuevo"
                document.getElementById(`addButton-${this.tableId}`).disabled = false;
            });
    }


    // Método para manejar la edición de una fila
    handleEdit(event, recordId) {
        const row = event.target.closest('tr'); // Identifica la fila del botón de edición

        this.columns.forEach((col, index) => {
            const cell = row.children[index];
            let value = cell.textContent.trim();

            // Si el campo está definido en selectFields...
            if (this.selectFields.hasOwnProperty(col.field.toLowerCase())) {
                let selectHTML = `<select name="${col.field}" style="width:100%;">`;
                // Obtener las opciones para ese campo desde selectOptions
                let options = this.selectOptions[col.field.toLowerCase()] || [];
                // Bandera para verificar si encontramos el valor que ya estaba en el TD
                let selectedFound = false;
                options.forEach(opt => {
                    if (opt.value == value) {
                        selectedFound = true;
                    }
                    const selected = (opt.value == value) ? "selected" : "";
                    selectHTML += `<option value="${opt.value}" ${selected}>${opt.text}</option>`;
                });
                // Si no se encontró ninguna opción que coincida y el TD tenía un valor, lo añadimos
                if (!selectedFound && value !== "") {
                    selectHTML += `<option value="${value}" selected>${value}</option>`;
                }
                selectHTML += `</select>`;
                cell.innerHTML = selectHTML;
            } else {
                // Si el campo es "id", lo hacemos readonly para evitar su modificación
                if (col.field.toLowerCase() === 'id') {
                    cell.innerHTML = `<input type="text" name="${col.field}" value="${value}" style="width:100%;" readonly>`;
                } else {
                    // Continuar con la lógica normal para inputs según el tipo (checkbox, datetime, etc.)
                    const inputType = this.getInputType(col.type);
                    if (inputType === 'checkbox') {
                        const isChecked = (value.toLowerCase() === 'true' || value === '1') ? 'checked' : '';
                        cell.innerHTML = `<input type="checkbox" name="${col.field}" ${isChecked} style="width:100%;">`;
                    } else if (inputType === 'datetime-local') {
                        let formattedValue = value.includes(' ') ? value.replace(' ', 'T') : value;
                        cell.innerHTML = `<input type="datetime-local" step="1" name="${col.field}" value="${formattedValue}" style="width:100%;">`;
                    } else {
                        cell.innerHTML = `<input type="${inputType}" name="${col.field}" value="${value}" style="width:100%;">`;
                    }
                }
            }
        });



        // Agrega botones para guardar o cancelar cambios
        const actionsCell = row.querySelector('td:last-child');
        actionsCell.innerHTML = `
        <button class="save-button" data-id="${recordId}">Guardar</button>
        <button class="cancel-button" data-id="${recordId}">Cancelar</button>
    `;

        // Asigna eventos dinámicos a "Guardar" y "Cancelar"
        actionsCell.querySelector('.save-button').addEventListener('click', (event) => this.handleSave(event, recordId));
        actionsCell.querySelector('.cancel-button').addEventListener('click', (event) => this.handleCancel(event, recordId));
    }
    handleSave(event, recordId) {
        const row = event.target.closest('tr'); // Identifica la fila donde se están haciendo las modificaciones

        const updatedFields = []; // Array de campos a actualizar
        const updatedValues = []; // Array de valores

        // Recorremos cada columna (excluyendo la columna de ID en algunos casos)
        this.columns.forEach((col, index) => {
            const cell = row.children[index];
            // Se busca un <input> o <select> en la celda
            const input = cell.querySelector('input, select');
            if (input) {
                updatedFields.push(col.field);
                // Validamos si el elemento es un select; en ese caso, tomamos su valor directamente
                if (input.tagName.toLowerCase() === 'select') {
                    updatedValues.push(input.value);
                } else if (input.type === 'checkbox') {
                    updatedValues.push(input.checked);
                } else if (input.type === 'datetime-local') {
                    // Convertir "YYYY-MM-DDTHH:MM:SS" a "YYYY-MM-DD HH:MM:SS"
                    updatedValues.push(input.value.replace('T', ' '));
                } else {
                    updatedValues.push(input.value);
                }
            }
        });

        // Convertir a cadenas concatenadas mediante comas
        const fieldsString = updatedFields.join(',');
        const valuesString = updatedValues.map(val => `'${val}'`).join(','); // se asume que los valores ya vienen entrecomillados

        // Se realiza la llamada a la API para el update (kind = 3)
        this.apiCallJson(3, { columnsToInclude: fieldsString, values: valuesString, tableName: this.tableName })
            .then(result => {
                if (result && result[0]?.success === 1) {
                    alert("Registro actualizado con éxito");
                    this.fetchRecords();
                } else {
                    alert("Error al actualizar el registro");
                }
            })
            .catch(error => {
                console.error("Error en la solicitud:", error);
            });
    }



    handleCancel(recordId) {
        // Simplemente recarga la tabla para cancelar los cambios
        this.fetchRecords();
    }

    handleDelete(event, recordId) {
        if (confirm("¿Estás seguro de que deseas eliminar este registro?")) {
            console.log("Eliminando registro con ID:", recordId);

            // Realiza la llamada a la API para eliminar el registro
            this.apiCallJson(4, { Id: recordId, tableName: this.tableName })
                .then(result => {
                    console.log("Respuesta de la API:", result);

                    // Verifica si la eliminación fue exitosa
                    if (result && result[0]?.success === 1) {
                        alert("Registro eliminado con éxito");
                        this.fetchRecords();
                    } else {
                        alert("Error al eliminar el registro");
                    }
                })
                .catch(error => {
                    console.error("Error en la solicitud:", error);
                });
        } else {
            console.log("Eliminación cancelada por el usuario.");
        }
    }

    // Función auxiliar para operaciones (insertar, actualizar, eliminar)
    async apiCallJson(kind, parameters) {
        const payload = {
            'Name': this.spName,
            'Parameters': {
                '@kind': kind,
                ...parameters
            }
        };
        console.log(payload)
        const request = new Request(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        try {
            const response = await fetch(request);
            const resultJson = await response.json();
            return resultJson;
        } catch (error) {
            console.error("Error en la API:", error);
            return null;
        }
    }

    /* PENDIENTE*/
    async fetchSelectOptions() {
        /*
          Llama a la API (kind = 6) para obtener las opciones que se usarán en los <select>
          para campos específicos.
          
          En este ejemplo, se asume que para el campo 'item' se hará la llamada con:
             parameters: { columnsToInclude: 'item' }
          y que la respuesta de la API es un arreglo de objetos cuyos campos son:
             { ITEM: 'valor1' }
             
          La función transforma esos resultados en el formato:
             { value: 'valor1', text: 'valor1' }
             
          Puedes ampliar esta lógica para otros campos, definiendo en la configuración 
          un objeto selectFields que mapee cada campo a su respectiva configuración.
        */
        const dataJson = await this.apiCallJson(6, { columnsToInclude: 'item', tableName: this.tableName });
        console.log("Opciones para 'item':", dataJson);

        if (dataJson && dataJson.length > 0) {
            // Asegurarnos de inicializar selectOptions si no está definido.
            this.selectOptions = this.selectOptions || {};
            // Mapear cada registro de la respuesta a un objeto con { value, text }.
            this.selectOptions['item'] = dataJson.map(opt => {
                return { value: opt.ITEM, text: opt.ITEM };
            });
        } else {
            console.error("No se pudieron obtener opciones para el campo 'item'");
        }
    }


}

function formatDateForDisplay(dateStr) {
    if (!dateStr) return '';
    // Verifica si contiene la "T" y reemplázala por un espacio
    return dateStr.indexOf('T') > -1 ? dateStr.replace('T', ' ') : dateStr;
}